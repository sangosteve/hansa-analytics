"""
HansaWorld ERP client.
Pass company_no explicitly to override the settings default,
enabling multi-company refresh in a single process.
"""

from typing import Optional

import httpx

from app.core.config import settings


class HansaClient:
    def __init__(self, company_no: Optional[str] = None) -> None:
        self.base_url = settings.hansa_base_url.rstrip("/")
        self.company_no = company_no or settings.hansa_company_no
        self.auth = (settings.hansa_username, settings.hansa_password)

    async def _request(self, path: str) -> httpx.Response:
        url = f"{self.base_url}/{path.lstrip('/')}"

        async with httpx.AsyncClient(
            timeout=300,
            auth=self.auth,
            headers={"Accept": "application/json"},
        ) as client:
            response = await client.get(url)

        return response

    def _extract_records(self, data):
        """
        Hansa may return:
        - a direct list: [{...}, {...}]
        - a wrapped dict: {"rows": [...]}
        - a register-named dict: {"ITVc": [...]}
        - a nested dict containing the list somewhere deeper
        """
        if isinstance(data, list):
            if all(isinstance(row, dict) for row in data):
                return data

        if isinstance(data, dict):
            # Common wrapper keys
            for key in ["data", "rows", "records", "result", "items"]:
                value = data.get(key)
                if isinstance(value, list):
                    return value

            # Hansa may use register names as keys e.g. {"ITVc": [...]}
            for value in data.values():
                if isinstance(value, list) and all(isinstance(row, dict) for row in value):
                    return value

            # Search one level deeper
            for value in data.values():
                if isinstance(value, dict):
                    try:
                        return self._extract_records(value)
                    except ValueError:
                        pass

        raise ValueError(
            f"Could not extract records from Hansa response. "
            f"Response type: {type(data)}. "
            f"Top-level keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}"
        )

    async def _get(self, path: str) -> list[dict]:
        response = await self._request(path)

        response.raise_for_status()

        try:
            data = response.json()
        except Exception as error:
            raise ValueError(
                "Hansa response is not valid JSON. "
                f"Status: {response.status_code}. "
                f"Content-Type: {response.headers.get('content-type')}. "
                f"First 500 chars: {response.text[:500]}"
            ) from error

        return self._extract_records(data)

    async def _get_paginated(self, path: str, page_size: int = 500) -> list[dict]:
        """
        Fetch all records from a Hansa endpoint using offset-based pagination.
        Hansa supports ?limit=N&offset=N query parameters.
        Stops when a page returns fewer records than page_size.
        """
        sep = "&" if "?" in path else "?"
        all_records: list[dict] = []
        offset = 0
        while True:
            url = f"{path}{sep}limit={page_size}&offset={offset}"
            page = await self._get(url)
            all_records.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        return all_records

    async def iter_pages(self, path: str, page_size: int = 500):
        """
        Async generator that yields one page at a time — keeps memory flat.
        """
        sep = "&" if "?" in path else "?"
        offset = 0
        while True:
            url = f"{path}{sep}limit={page_size}&offset={offset}"
            page = await self._get(url)
            if page:
                yield page
            if len(page) < page_size:
                break
            offset += page_size

    async def get_item_groups(self) -> list[dict]:
        return await self._get_paginated(
            f"api/{self.company_no}/ITVc?fields=Code,Comment"
        )

    async def get_items(self) -> list[dict]:
        return await self._get_paginated(
            f"api/{self.company_no}/INVc"
            "?fields=Code,AlternativeCode,Name,Group,Weight,UnitCoefficient"
        )

    async def get_customers(self) -> list[dict]:
        return await self._get_paginated(
            f"api/{self.company_no}/CUVc?fields=Code,Name,CUType&filter.CUType=1"
        )

    async def get_invoices(self, date_from: str, date_to: str) -> list[dict]:
        """
        Fetch stock-updating invoices (UpdStockFlag=1, OKFlag=1) for the date range.
        Includes financial fields (Sum1, Sum4, BaseSum4, PayDate, PDays, CurncyCode, CredInv)
        added in Phase 1 for revenue and profitability analytics.
        OrderNr is included so deliveries can be linked back for salesperson attribution.
        """
        return await self._get(
            f"api/{self.company_no}/IVVc"
            f"?sort=InvDate"
            f"&range={date_from}:{date_to}"
            f"&filter.OKFlag=1"
            f"&filter.UpdStockFlag=1"
            f"&fields=SerNr,InvDate,CustCode,OrderNr,ArtCode,Quant,Location,"
            f"NotUpdStockFlag,UpdStockFlag,SalesMan,PayDeal,CredMark,InvType,OKFlag,"
            f"PayDate,PDays,CurncyCode,CredInv,Sum1,Sum4,BaseSum4"
        )

    async def get_deliveries(self, date_from: str, date_to: str) -> list[dict]:
        return await self._get(
            f"api/{self.company_no}/SHVc"
            f"?sort=ShipDate"
            f"&range={date_from}:{date_to}"
            f"&filter.OKFlag=1"
            f"&fields=SerNr,OrderNr,ShipDate,CustCode,ArtCode,Ship,Location,Weight,OKFlag"
        )

    async def get_receipts(self, date_from: str, date_to: str) -> list[dict]:
        """
        Fetch customer payment receipts (IPVc register) for the date range.
        Receipts are fetched per company (self.company_no).
        Fields: SerNr, CustCode, TransDate, InvoiceNr, InvCurncy, PayDate,
                RecCurncy, RecVal, OkFlag.
        """
        return await self._get(
            f"api/{self.company_no}/IPVc"
            f"?sort=TransDate"
            f"&range={date_from}:{date_to}"
            f"&fields=SerNr,CustCode,TransDate,InvoiceNr,InvCurncy,PayDate,RecCurncy,RecVal,OkFlag"
        )

    async def get_sales_orders(self, date_from: str, date_to: str) -> list[dict]:
        """
        Fetch sales orders (SOVc register) for the date range.
        Fetched per company (self.company_no).
        Fields include header financials and line items.
        """
        return await self._get(
            f"api/{self.company_no}/SOVc"
            f"?sort=OrderDate"
            f"&range={date_from}:{date_to}"
            f"&fields=SerNr,CustCode,OrderDate,SalesMan,OKFlag,CurncyCode,"
            f"PayDeal,Sum1,Sum4,BaseSum4"
        )

    async def get_gl_transactions(self, date_from: str, date_to: str) -> list[dict]:
        """
        Fetch GL transaction lines from the Hansa TRVc register for this company.
        Each row is one account line within a journal/voucher — contains DebVal/CredVal
        per AccNumber, used to build Revenue, Cost of Sales, OPEX P&L analytics.

        The date range filter applies to TransDate (the posting date).
        """
        return await self._get_paginated(
            f"api/{self.company_no}/TRVc"
            f"?sort=TransDate"
            f"&range={date_from}:{date_to}"
            f"&fields=Number,RegDate,Comment,TransDate,DSum,CSum,DSum2,CSum2,"
            f"TransNr,AccNumber,DebVal,CredVal,VATCode,Qty,Curncy,DebVal2,CredVal2"
        )

    async def get_gl_accounts(self, company_no: str = "1") -> list[dict]:
        """
        Fetch GL accounts (AccVc register) from the master company.
        Always fetched from company 1 (the master/holding company).
        """
        return await self._get_paginated(
            f"api/{company_no}/AccVc"
            f"?fields=AccNumber,Comment,AccType,Curncy,GroupAcc"
        )

    async def get_item_stock_status(self, location: str) -> list[dict]:
        """
        Fetch the ItemStatusVc (Item Status) support register for a specific
        warehouse location.  Returns one row per item in that location.

        Fields returned by Hansa: Code (item code), Location, Instock,
        OrddOut (customer orders out), POQty, RsrvQty, InShipment, WeighedAvPrice.
        Note: the item key field is "Code", not "ArtCode", and customer-order qty
        is "OrddOut" (double-d).  Empty Code rows are warehouse-level totals — skip them.
        """
        return await self._get(
            f"api/{self.company_no}/ItemStatusVc"
            f"?fields=Code,Location,Instock,OrddOut,POQty,RsrvQty,InShipment,WeighedAvPrice"
            f"&filter.Location={location}"
        )

    async def debug_item_groups_response(self) -> dict:
        response = await self._request(
            f"api/{self.company_no}/ITVc"
            "?fields=Code,Comment"
        )

        try:
            data = response.json()
        except Exception:
            return {
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type"),
                "json_valid": False,
                "first_1000_chars": response.text[:1000],
            }

        return {
            "status_code": response.status_code,
            "content_type": response.headers.get("content-type"),
            "json_valid": True,
            "data_type": str(type(data)),
            "top_level_keys": list(data.keys()) if isinstance(data, dict) else None,
            "sample": data,
        }

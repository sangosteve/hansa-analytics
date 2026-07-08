"""
Swagger 2.0 spec for the Microsoft 365 Copilot connector.
Exposes only safe, read-only, report-focused endpoints.
"""

COPILOT_SWAGGER: dict = {
    "swagger": "2.0",
    "info": {
        "title": "Hansa Analytics Copilot API",
        "description": (
            "Safe read-only reporting API for Microsoft 365 Copilot. "
            "Provides structured dashboard analytics data for generating "
            "professional business performance reports."
        ),
        "version": "1.0.0",
    },
    "host": "hansa-analytics-api.onrender.com",
    "basePath": "/",
    "schemes": ["https"],
    "consumes": ["application/json"],
    "produces": ["application/json"],
    "securityDefinitions": {
        "BearerAuth": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "Enter the bearer token in this format: Bearer YOUR_TOKEN",
        }
    },
    "security": [{"BearerAuth": []}],
    "paths": {
        "/api/copilot/reports/sales-performance": {
            "get": {
                "operationId": "getSalesPerformanceReport",
                "summary": "Get monthly sales performance report data",
                "description": (
                    "Returns trusted dashboard analytics data required by Microsoft 365 Copilot "
                    "to generate a professional monthly sales performance report with charts, "
                    "observations, risks, and recommendations. "
                    "All sales figures are expressed in tonnes (monetary amounts are not available)."
                ),
                "tags": ["Copilot Reports"],
                "security": [{"BearerAuth": []}],
                "parameters": [
                    {
                        "name": "month",
                        "in": "query",
                        "required": True,
                        "type": "string",
                        "description": "Month for the report in YYYY-MM format. Example: 2026-06",
                        "pattern": r"^\d{4}-(?:0[1-9]|1[0-2])$",
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Sales performance report data returned successfully",
                        "schema": {"$ref": "#/definitions/SalesPerformanceReport"},
                    },
                    "400": {
                        "description": "Invalid month format",
                        "schema": {"$ref": "#/definitions/ErrorResponse"},
                    },
                    "401": {
                        "description": "Unauthorized — missing or invalid bearer token",
                        "schema": {"$ref": "#/definitions/ErrorResponse"},
                    },
                    "500": {
                        "description": "Server error",
                        "schema": {"$ref": "#/definitions/ErrorResponse"},
                    },
                },
            }
        }
    },
    "definitions": {
        "ErrorResponse": {
            "type": "object",
            "properties": {
                "error": {"type": "string", "example": "Unauthorized"}
            },
        },
        "Period": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "Month in YYYY-MM format",
                    "example": "2026-06",
                },
                "start_date": {
                    "type": "string",
                    "format": "date",
                    "example": "2026-06-01",
                },
                "end_date": {
                    "type": "string",
                    "format": "date",
                    "example": "2026-06-30",
                },
                "label": {
                    "type": "string",
                    "example": "June 2026",
                },
            },
        },
        "ExecutiveSummaryMetrics": {
            "type": "object",
            "description": "Key performance metrics for the month. Monetary amounts are null — all sales figures are in tonnes.",
            "properties": {
                "total_sales": {
                    "type": "number",
                    "description": "Total sales value (null — monetary data not available)",
                    "x-nullable": True,
                },
                "total_tonnage": {
                    "type": "number",
                    "description": "Total tonnes sold during the month",
                    "example": 216.58,
                },
                "invoice_count": {
                    "type": "integer",
                    "description": "Number of distinct invoices in the period",
                    "example": 42,
                },
                "customer_count": {
                    "type": "integer",
                    "description": "Number of distinct customers who purchased",
                    "example": 18,
                },
                "average_daily_sales": {
                    "type": "number",
                    "description": "Average daily sales value (null — monetary data not available)",
                    "x-nullable": True,
                },
                "average_daily_tonnage": {
                    "type": "number",
                    "description": "Average tonnes sold per calendar day in the month",
                    "example": 7.22,
                },
                "target_sales": {
                    "type": "number",
                    "description": "Sales target in value (null — monetary data not available)",
                    "x-nullable": True,
                },
                "target_tonnage": {
                    "type": "number",
                    "description": "Sales target in tonnes for the month",
                    "x-nullable": True,
                    "example": 200.0,
                },
                "sales_target_achievement_percent": {
                    "type": "number",
                    "description": "Percentage of monetary sales target achieved (null — not available)",
                    "x-nullable": True,
                },
                "tonnage_target_achievement_percent": {
                    "type": "number",
                    "description": "Percentage of tonnage target achieved",
                    "x-nullable": True,
                    "example": 108.3,
                },
                "month_on_month_sales_change_percent": {
                    "type": "number",
                    "description": "Month-on-month change in sales value (null — not available)",
                    "x-nullable": True,
                },
                "month_on_month_tonnage_change_percent": {
                    "type": "number",
                    "description": "Month-on-month change in tonnage as a percentage",
                    "x-nullable": True,
                    "example": 18.4,
                },
            },
        },
        "TargetVsActualDetail": {
            "type": "object",
            "properties": {
                "actual": {"type": "number", "x-nullable": True},
                "target": {"type": "number", "x-nullable": True},
                "achievement_percent": {"type": "number", "x-nullable": True},
                "variance": {"type": "number", "x-nullable": True},
            },
        },
        "TargetVsActual": {
            "type": "object",
            "properties": {
                "sales": {
                    "$ref": "#/definitions/TargetVsActualDetail",
                    "description": "Sales value target vs actual (null — monetary data not available)",
                },
                "tonnage": {
                    "$ref": "#/definitions/TargetVsActualDetail",
                    "description": "Tonnage target vs actual",
                },
            },
        },
        "DailySalesTrendItem": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "format": "date",
                    "example": "2026-06-01",
                },
                "sales": {
                    "type": "number",
                    "description": "Daily sales value (null — not available)",
                    "x-nullable": True,
                },
                "tonnage": {
                    "type": "number",
                    "description": "Total tonnes sold on this day",
                    "example": 7.4,
                },
                "invoice_count": {
                    "type": "integer",
                    "description": "Number of invoices on this day",
                    "example": 3,
                },
            },
        },
        "CustomerPerformanceItem": {
            "type": "object",
            "properties": {
                "customer_code": {"type": "string", "example": "CUST001"},
                "customer_name": {"type": "string", "example": "Acme Mining Ltd"},
                "sales": {
                    "type": "number",
                    "description": "Sales value (null — not available)",
                    "x-nullable": True,
                },
                "tonnage": {"type": "number", "example": 45.2},
                "invoice_count": {"type": "integer", "example": 6},
                "share_of_total_sales_percent": {
                    "type": "number",
                    "description": "This customer's share of total period tonnage",
                    "example": 20.9,
                    "x-nullable": True,
                },
            },
        },
        "ProductPerformanceItem": {
            "type": "object",
            "properties": {
                "item_code": {"type": "string", "example": "ITEM-001"},
                "item_name": {"type": "string", "example": "Bulk Aggregate 10mm"},
                "product_group": {"type": "string", "example": "Aggregates"},
                "sales": {
                    "type": "number",
                    "description": "Sales value (null — not available)",
                    "x-nullable": True,
                },
                "tonnage": {"type": "number", "example": 32.1},
                "quantity": {"type": "number", "example": 32.1},
                "share_of_total_sales_percent": {
                    "type": "number",
                    "x-nullable": True,
                    "example": 14.8,
                },
            },
        },
        "ProductGroupPerformanceItem": {
            "type": "object",
            "properties": {
                "product_group_code": {"type": "string", "example": "AGG"},
                "product_group_name": {"type": "string", "example": "Aggregates"},
                "sales": {
                    "type": "number",
                    "description": "Sales value (null — not available)",
                    "x-nullable": True,
                },
                "tonnage": {"type": "number", "example": 88.4},
                "quantity": {"type": "number", "example": 88.4},
                "share_of_total_sales_percent": {
                    "type": "number",
                    "x-nullable": True,
                    "example": 40.8,
                },
            },
        },
        "ChartDatasets": {
            "type": "object",
            "description": "Pre-shaped data arrays ready for chart rendering.",
            "properties": {
                "daily_sales_trend": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "format": "date"},
                            "sales": {"type": "number", "x-nullable": True},
                            "tonnage": {"type": "number"},
                        },
                    },
                },
                "target_vs_actual": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "metric": {"type": "string", "example": "Tonnage"},
                            "actual": {"type": "number", "x-nullable": True},
                            "target": {"type": "number", "x-nullable": True},
                        },
                    },
                },
                "top_customers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "customer_code": {"type": "string"},
                            "customer_name": {"type": "string"},
                            "tonnage": {"type": "number"},
                        },
                    },
                },
                "top_products": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "item_name": {"type": "string"},
                            "tonnage": {"type": "number"},
                        },
                    },
                },
                "sales_by_product_group": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "product_group_name": {"type": "string"},
                            "tonnage": {"type": "number"},
                        },
                    },
                },
            },
        },
        "CopilotGuidance": {
            "type": "object",
            "description": "Hints for Copilot on how to structure and present the generated report.",
            "properties": {
                "suggested_report_sections": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "recommended_charts": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "important_instruction": {
                    "type": "string",
                    "example": "Use only the data returned by this endpoint. Do not invent figures.",
                },
            },
        },
        "DataQuality": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["complete", "partial"],
                    "description": "'complete' when all data sections loaded without errors; 'partial' when one or more sections failed to load.",
                },
                "warnings": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Section-level failures. Empty when status is 'complete'.",
                },
                "notes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Informational notes about the dataset (e.g. missing monetary data). Do not treat these as errors.",
                },
                "last_refreshed_at": {
                    "type": "string",
                    "format": "date-time",
                    "description": "ISO 8601 datetime of the most recent successful data sync from ERP.",
                    "x-nullable": True,
                },
            },
        },
        "DashboardSection": {
            "type": "object",
            "description": "A section that embeds existing dashboard analytics data unchanged.",
            "properties": {
                "description": {"type": "string"},
                "data": {
                    "type": "object",
                    "description": "The raw dashboard data object for this section.",
                },
            },
        },
        "SalesPerformanceReport": {
            "type": "object",
            "required": ["report_title", "report_type", "period", "executive_summary_metrics"],
            "properties": {
                "report_title": {
                    "type": "string",
                    "example": "Sales Performance Report",
                },
                "report_type": {
                    "type": "string",
                    "example": "monthly_sales_performance",
                },
                "period": {"$ref": "#/definitions/Period"},
                "currency": {
                    "type": "string",
                    "description": "Null — monetary currency data is not available in this dataset.",
                    "x-nullable": True,
                },
                "units": {
                    "type": "object",
                    "properties": {
                        "sales": {
                            "type": "string",
                            "example": "tonnes",
                            "description": "Unit for sales figures (tonnes — monetary values not available)",
                        },
                        "tonnage": {"type": "string", "example": "tonnes"},
                    },
                },
                "executive_summary_metrics": {
                    "$ref": "#/definitions/ExecutiveSummaryMetrics"
                },
                "sales_summary": {"$ref": "#/definitions/DashboardSection"},
                "daily_sales_trend": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/DailySalesTrendItem"},
                },
                "target_vs_actual": {"$ref": "#/definitions/TargetVsActual"},
                "top_customers": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/CustomerPerformanceItem"},
                },
                "top_products": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/ProductPerformanceItem"},
                },
                "sales_by_product_group": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/ProductGroupPerformanceItem"},
                },
                "customer_movement": {"$ref": "#/definitions/DashboardSection"},
                "movement_analytics": {"$ref": "#/definitions/DashboardSection"},
                "stock_summary": {"$ref": "#/definitions/DashboardSection"},
                "predictive_insights": {"$ref": "#/definitions/DashboardSection"},
                "chart_datasets": {"$ref": "#/definitions/ChartDatasets"},
                "copilot_guidance": {"$ref": "#/definitions/CopilotGuidance"},
                "data_quality": {"$ref": "#/definitions/DataQuality"},
            },
        },
    },
}

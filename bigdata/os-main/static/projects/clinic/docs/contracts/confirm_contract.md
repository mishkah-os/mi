# Clinic Confirm Contract API

## Endpoint: `clinic-confirm-contract`

**Method**: RPC (via `/api/rpc/clinic-confirm-contract?branch=pt`)

**Description**: Confirms a new contract, creating the necessary records in `clinic_contracts_header`, lines, and creating an associated invoice.

### Payload

```json
{
    "form": {
        "company_id": "35BA090E-2828-41ED-9C66-054979646F36",
        "branch_id": "B83BE2C8-564A-4234-8501-C4E068B4AB2C",
        "user_insert": "9A3C9FB3-D1FA-472F-98E1-9D47924E1E5C",
        "contract_date": "2026-01-18",
        "start_date": "2026-01-18",
        "contract_status": "confirmed",
        "patient": "id-c9b831a6-0507-465b-a1e9-864e61ec932a",
        "clinic_type": "c21e44b7-257e-5ec0-aaed-73b5ca1f38df",
        "supervising_doctor": "8319a0e6-b99f-58d0-90c2-ec5444b44384",
        "executing_doctor": "8319a0e6-b99f-58d0-90c2-ec5444b44384",
        "total_amount": 2700
    },
    "lines": [
        {
            "id": "line-mkjzapo2",
            "mode": "package",
            "service": "17fa73a7-54cc-5bb8-93c2-e99c31cb78e7",
            "service_package": "6814939c-bcea-50de-8ca7-5dbf68d992cd",
            "service_package_tier": "9af90d55-b68b-5a2b-871f-50760f0cd7f8",
            "sessions_count": 6,
            "unit_price": 450,
            "price_total": 2700,
            "discount_percent": 10
        }
    ],
    "schedule": [],
    "selectedSlots": [
        {
            "id": "0981f512-ccea-4ca1-9885-13df12f4b8fb",
            "slots": [
                {
                    "id": "0981f512-ccea-4ca1-9885-13df12f4b8fb",
                    "company_id": "35BA090E-2828-41ED-9C66-054979646F36",
                    "branch_id": "default",
                    "slot_date": "2026-01-18",
                    "slot_time_start": "14:00:00",
                    "slot_time_end": "14:30:00",
                    "slot_start_datetime": "2026-01-18T13:00:00.000Z",
                    "slot_end_datetime": "2026-01-18T13:30:00.000Z",
                    "doctor": "8319a0e6-b99f-58d0-90c2-ec5444b44384",
                    "station": "3869d3bd-4f8f-5488-9826-b7aa64743ee4",
                    "slot_status": "available",
                    "blocked_reason": null,
                    "cancelled_reason": null,
                    "cancelled_at": "2026-01-18T16:56:41.776Z",
                    "cancelled_by": null,
                    "is_booked": 0,
                    "is_active": 1,
                    "begin_date": "2026-01-18T16:56:41.764Z"
                }
            ],
            "slot_date": "2026-01-18",
            "slot_time_start": "14:00:00",
            "slot_time_end": "14:30:00",
            "label": "14:00 - 14:30",
            "blockId": "0981f512-ccea-4ca1-9885-13df12f4b8fb|2026-01-18|14:00:00"
        }
    ],
    "lineBookings": {
        "line-mkjzapo2": [
             {
                "id": "0981f512-ccea-4ca1-9885-13df12f4b8fb",
                "slots": [
                    {
                        "id": "0981f512-ccea-4ca1-9885-13df12f4b8fb",
                        "company_id": "35BA090E-2828-41ED-9C66-054979646F36",
                        "branch_id": "default",
                        "slot_date": "2026-01-18",
                        "slot_time_start": "14:00:00",
                        "slot_time_end": "14:30:00",
                        "slot_start_datetime": "2026-01-18T13:00:00.000Z",
                        "slot_end_datetime": "2026-01-18T13:30:00.000Z",
                        "doctor": "8319a0e6-b99f-58d0-90c2-ec5444b44384",
                        "station": "3869d3bd-4f8f-5488-9826-b7aa64743ee4",
                        "slot_status": "available",
                        "blocked_reason": null,
                        "cancelled_reason": null,
                        "cancelled_at": "2026-01-18T16:56:41.776Z",
                        "cancelled_by": null,
                        "is_booked": 0,
                        "is_active": 1,
                        "begin_date": "2026-01-18T16:56:41.764Z"
                    }
                ],
                "slot_date": "2026-01-18",
                "slot_time_start": "14:00:00",
                "slot_time_end": "14:30:00",
                "label": "14:00 - 14:30",
                "blockId": "0981f512-ccea-4ca1-9885-13df12f4b8fb|2026-01-18|14:00:00"
            }
        ]
    },
    "totalAmount": 2700,
    "paidAmount": 0,
    "payments": [
        {
            "id": "pay-mkjzahvu",
            "method": "cash",
            "amount": 0,
            "payment_date": "2026-01-18T16:56:30.474Z"
        }
    ],
    "user": {
        "id": "9A3C9FB3-D1FA-472F-98E1-9D47924E1E5C"
    }
}
```

### Response

```json
{
    "success": true,
    "contractId": "c797b98b-76a3-4a59-8745-de190ac71b68",
    "invoiceId": "7c006cdd-383e-456c-9f6b-6843ae744f90"
}
```

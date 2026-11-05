# Bulk-users upload fixture

`WL/wladdmultiplepractitioners.test.js` **generates its upload file at runtime** –
it downloads the live template from the app, writes `BULK_COUNT` fresh rows into
the "Practitioner Template" sheet from the run counter, and uploads that. Nothing
in this folder is required for the test to run.

`bulk-users-template.xlsx` here is kept only as a **reference example** of a
filled-in template.

## Columns (sheet "Practitioner Template", from the app's downloaded template)

| # | Header                     | Rule                                                        |
|---|----------------------------|------------------------------------------------------------|
| 1 | Type of identification     | Text, must be `id` or `passport`                           |
| 2 | ID number                  | Number, required if type is `id`, 13 digits                |
| 3 | Passport                   | Text, required if type is `passport`                       |
| 4 | First name                 | Text, required                                             |
| 5 | Surname                    | Text, required                                             |
| 6 | Cellphone number           | Number, required, 9 or 10 digits                           |
| 7 | Coach ID/passport number   | Text, optional                                             |

Do not modify the header row.

## What the test writes (naming convention: BulkUsers000001, incrementing by 1)

Each run allocates the next block of `BULK_COUNT` (default 5) ids from
`WL/.wl-bulkusers-counter.json` and produces rows like:

| Type of identification | ID number | Passport        | First name      | Surname   | Cellphone number | Coach ID/passport number |
|------------------------|-----------|-----------------|-----------------|-----------|------------------|--------------------------|
| passport               |           | BulkUsers000001 | BulkUsers000001 | BulkUser  | 0772837485       |                          |
| passport               |           | BulkUsers000002 | BulkUsers000002 | BulkUser  | 0772837486       |                          |
| ...                    |           | ...             | ...             | BulkUser  | ...              |                          |

The phone number tracks the id: `0772837485 + (n - 1)`.

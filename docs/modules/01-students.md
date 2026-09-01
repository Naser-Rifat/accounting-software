# 1. Student Management

Master record for every prospect and enrolled student. Entry point of the pipeline.

## Data

| Group | Fields |
|---|---|
| Profile | code, firstName, lastName, dob, gender, nationality, photo |
| Passport | passportNo, issueDate, expiryDate, issuingCountry |
| Contact | email, phone, whatsapp, address, city, country, emergencyContact |
| Academic | level, institution, subject, result/GPA, yearOfPassing (many per student) |
| Preferences | preferredCountries[], preferredUniversities[], preferredIntake |
| Assignment | counselorId, agentId (nullable) |
| Derived | status, applicationCount, totalPaid, totalDue |

Documents live in the shared `Document` table, typed:
PASSPORT, ACADEMIC_TRANSCRIPT, CERTIFICATE, IELTS, SOP, LOR, CV, BANK_STATEMENT,
OFFER_LETTER, VISA, OTHER.

## Rules

1. `status` is derived from the furthest-progressed application, not set by hand,
   except for manual `LEAD`/`COUNSELING`/`DROPPED`. See 02-status-flows.md.
2. A student may have many applications across universities and intakes.
3. Passport expiring within 6 months of intake start = warning flag on the profile.
4. Deleting a student with applications is forbidden; deactivate instead.

## Screens

| Route | Contents |
|---|---|
| `/students` | Table: code, name, counselor, status, applications, due. Filter by status/counselor/intake/country. |
| `/students/new` | Multi-section form: profile, passport, contact, academic, preferences |
| `/students/[id]` | Tabs: Overview, Applications, Documents, Payments, Timeline |
| `/students/leads` | Same table filtered to LEAD |
| `/students/counseling` | Filtered to COUNSELING, with next-follow-up date |

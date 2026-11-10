# SpotOn

London parking map for catalogue car parks, on-street bays, and driver reports of how full a place looks.

Driver reports are taps from people using the app. They are labelled as driver reports, separate from live sensor counts. The browser sends a report to `POST /api/reports`. The server checks the place, the status, and the rate limit, then writes the database. The browser does not use Firestore.

## Driver report database

`REPORT_STORE` defaults to `firestore`. At startup the server tries Firestore once. When Firestore is not configured, or the connection fails, the server logs one warning and stores reports in `data/reports.json`. Set `REPORT_STORE=file` to use that file on purpose. The `data/` directory is gitignored.

Use the file store for local development and tests. Use Firestore when more than one server instance is running, so the rate limit is shared.

### Create the database

1. In Google Cloud Console, create a Firestore database in **Native mode**.
2. Choose region **europe-west2 (London)**.

### Service account

Create a service account for the API and grant **Cloud Datastore User** (`roles/datastore.user`). That role covers Firestore reads and writes.

On Cloud Run, Google Cloud, or an AI Studio deploy, attach this service account to the service. The Admin SDK then uses Application Default Credentials.

On any other machine, create a JSON key for that service account and set one of:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — the JSON object on one line
- `GOOGLE_APPLICATION_CREDENTIALS` — the path to the JSON file

Set `FIRESTORE_PROJECT_ID` when the project id is not inside those credentials and is not detected from the Cloud Run environment. Keep the JSON key out of git. `.env` is gitignored. `.env.example` lists the variable names and leaves the values empty.

### Rules and indexes

`firestore.rules` denies every client read and write. Deploy the rules and the composite indexes in `firestore.indexes.json`:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

The indexes cover:

- reports for one device since a time (`deviceHash`, `createdAt`), used when a rate-limit record is missing
- reports for one place since a time (`facilityId`, `createdAt`)

A query on `createdAt` alone uses Firestore’s automatic single-field index.

### TTL

Each report document includes `expireAt`, set two hours after the write. Enable a TTL policy on collection group `reports`, field `expireAt`:

```bash
gcloud firestore fields ttls update expireAt --collection-group=reports --enable-ttl
```

In the console: Firestore → Time-to-live → Create policy → collection group `reports`, field `expireAt`.

Firestore can take a while to delete a document after `expireAt`. The API already ignores reports older than two hours, so the screen does not wait on that deletion.

`reportLimits` documents also carry `expireAt` (two hours after the latest report from that device). Add the same kind of policy on collection group `reportLimits` if you want those documents removed automatically. The rate limit reads the timestamps inside the document, so it stays correct while the document exists.

### Documents

Collection `reports` (document id is the report id):

| Field | Contents |
| --- | --- |
| `facilityId` | Car park id or on-street bay / street key |
| `status` | `spaces_available`, `filling_up`, `full`, or `closed` |
| `createdAt` | Server timestamp |
| `deviceHash` | SHA-256 of the anonymous device id |
| `expireAt` | TTL time, two hours after the report |

Collection `reportLimits` (document id is the device hash) stores the facility ids, report ids, and times from the last hour. `POST /api/reports` updates that document inside a Firestore transaction, so several server instances share the limit of one report per place every 10 minutes and 20 reports an hour. Undoing a report within 10 seconds deletes the report and leaves this rate-limit document in place.

The stored fields are the place, the status, the time, and the device hash. The raw device id, IP address, and precise user location are left out.

# Uganda preview inventory

The 50 original showcase records are fictional, market-informed examples, not
appointments to market third-party listings. All are published, unverified,
tagged `preview:uganda-showcase` and `preview`; ten are featured. Their descriptions
end with the required showcase disclosure and visibly credit each photograph.
No agent or agency is fabricated by this seed.

## Guarded execution

Use a private environment file containing the **current preview** Atlas URI.
Never paste credentials into a command or a report:

```sh
ENV_FILE=/absolute/private/homes-preview.env npm run seed:preview -- --confirm-preview
```

The private file must set `NODE_ENV=staging` and `MONGO_URI` with the exact database
path `/homes_preview`. The command refuses every other environment/database,
missing confirmation, an ambiguous dbName option, a connected database mismatch,
and any slug collision with unrelated inventory. It validates all 50 records
before writes. Repeat runs update their own records while retaining IDs and view
counts; only obsolete records carrying its own seed tag may be removed. Existing
development demo seed rules remain unchanged. No production environment setting
or infrastructure is modified.

## Composition and geography

8 ordinary rentals, 10 apartment rentals, 6 family-house rentals, 6 residential
sales, 8 land parcels, 4 commercial offerings, 4 serviced short stays, 2 hotel/
guest-house offerings and 2 upcountry homes. Uganda-only locations; Najjera,
Naalya and Kira are assigned to Wakiso, Sonde to Mukono, and Lubowa to Wakiso.
No invented exact street address or parcel coordinates are supplied. Fort Portal
and Mbarara use Western region. Plot dimensions in feet are converted to square
metres; decimals are represented as acres, without legal tenure promises.

## Market references (reviewed 9 October 2026)

Sources inform asking-price bands only; no listing copy or marketplace photos
are used. Asking prices are not transaction valuations or availability evidence.

- [Current Ntinda rentals](https://ugandapropertycentre.com/for-rent/central-region/kampala/ntinda?sort=4): apartment examples UGX 850,000–2,600,000/month.
- [Kisaasi ordinary rooms](https://kameruka.co.ug/Kameruka/HouseList.aspx?District=41&HouseCategory=2&Location=Kisaasi&RentSale=Rent&Title=SemiDetached+houses+for+rent+in+Kisaasi+-+Kampala): examples UGX 250,000–350,000/month.
- [Kira/Najjera rentals](https://ugandapropertycentre.com/for-rent/flats-apartments/central-region/wakiso/kira-town/showtype): examples UGX 700,000 for one bedroom and UGX 1,500,000 for two bedrooms.
- [Short stays](https://ugandapropertycentre.com/short-let): examples UGX 100,000, 130,000 and 150,000/night; premium examples higher.
- [Kira land](https://ugandapropertycentre.com/land/central-region/wakiso/kira-town/showtype?page=2): smaller plots around UGX 50M–85M; 100x100 examples around UGX 180M–250M.
- [Bujjuko asking-price example](https://jiji.ug/wakiso-wakiso/land-and-plots-for-sale/titled-50-100-plots-for-sale-in-bujjuko-jamir-estate-5OtPQCprxSRoNgsSb4URWSQ5.html): UGX 25M; used only as a price reference.
- [Muyenga residential sales](https://ugandapropertycentre.com/for-sale/central-region/kampala/muyenga): examples around UGX 1.5B.
- [Commercial office references](https://ugandapropertycentre.com/for-rent/central-region/kampala/kampala-central): UGX 1.5M/month example, strongly dependent on size and location.
- [Myrtle Concepts H2 2024 market report](https://myrtleconcepts.co.ug/wp-content/uploads/2025/03/Myrtle_Concepts__Property_Market_Report_H2_December_2024-2.pdf): older contextual reference for ordinary units and bungalow rents, not presented as October 2026 transaction evidence.
- [Knight Frank geography reference](https://content.knightfrank.com/research/2647/documents/en/kampala-next-neighborhoods-q1-2023-10093.pdf): Naalya in Kira municipality; historical report used for geography, not current prices.

## Media and attribution

`scripts/data/uganda-preview-media.json` records each actual Commons file page,
photographer, original URL, displayed rendition, licence and licence URL. Each
file was reviewed individually; category membership alone was not treated as a
licence. Use is illustrative and implies neither endorsement nor an exact match
to a fictional property. The existing API schema is preserved: full credits are
also visible in each description. Display renditions retain the source licence.
Videos are omitted because no matching reusable footage was established.

The reviewed 17 images were uploaded through the existing authenticated preview
media endpoint after checking its connected database was `homes_preview`.
Commons hotlinks intermittently returned HTTP 429; the display URLs therefore
use the preview's existing media service. Original source URLs, authors and
licences remain in the manifest and visible listing credits. Seed media trust
accepts only exact Commons image paths or this preview's `/media/images/` JPG
paths, never arbitrary remote hosts.

**Current preview storage limitation:** the Render service uses local ephemeral
media storage. These uploads are available now but are not durable across service
replacement/redeployment or idle spin-down. Configure durable S3-compatible storage before launch
and refresh the preview manifest after reuploading. Do not weaken the existing
production media guards to accommodate local disk. The reviewed source files
and upload checkpoints are retained locally under
`artifacts/showcase-real-logo/` outside the product repositories.

## Hosted execution record

9 October 2026: public inventory before seed: 0. First guarded execution created
50; second created 0, updated 50, removed 0, total 50. Public API verification
confirmed stable IDs, 10 featured records, pagination 20/20/10, rent/sale/short
stay counts 28/16/6, positive UGX amounts and all 17 image URLs returning HTTP 200.
All records remain published and unverified. No production database was used.

Run `npm run check` and `npm test`. Preview tests use a disposable local Mongo
instance, exercise both refusal and connected-database guards, seed twice and
check identity preservation, positive UGX prices, media/disclosure coverage,
exact category counts, unverified status, obsolete-tag-only cleanup and
preservation of unrelated genuine inventory.

The same 17 source photographs were subsequently resized (maximum 1280px,
JPEG quality 82, preserving aspect ratio) for preview delivery. Their combined
file size fell from 51,475,408 to 2,922,043 bytes, a 94% reduction. No content was
generated or substituted. Author/source/licence credits and illustrative notices
remain unchanged. Only this seed's own 50 records were updated with the smaller
preview media URLs; IDs and the exact total remained unchanged.

The optimized reusable source copies are committed in `scripts/data/media/`
for repeatable preview recovery or migration to durable media storage. Do not
reuse temporary upload URLs after Render has discarded its local files.

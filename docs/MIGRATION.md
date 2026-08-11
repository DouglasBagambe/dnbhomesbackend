# V1 migration

`npm run migrate:v1` is a read-only dry run. Review counts and database backups, then run `npm run migrate:v1 -- --apply` in staging before production.

The migration converts legacy pricing, purpose values, location, size, media, embedded agent data, status, featured state, and views. Embedded agents/agencies are deduplicated primarily by email/slug while the original object remains in `legacyAgent`. Legacy appointments become pending viewing requests when property and date exist.

Manual review is required for villa/studio type mapping, verification evidence, coordinates, price periods, duplicate agents, invalid media, ambiguous appointment duration, and inactive listings. The script never infers verification.

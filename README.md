# world-cup-2026

Extracted World Cup 2026 poster data from the provided HTML into reusable JSON sources for a webpage.

## Files

- `data/matches.json` — master match schedule.
- `data/groups.json` — group membership and group-stage fixtures.
- `data/venues.json` — venue metadata.
- `data/teams.json` — team code mappings found in the poster.

## Notes

The source HTML appears to embed schedule data directly in JavaScript constants rather than fetching from an external API. This repository stores a cleaned extraction target so the data can be consumed by a normal web application.

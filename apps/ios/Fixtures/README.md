# Fixture photographs

The ten photographs book p50 lists, downloaded from `images.unsplash.com` on 2026-11-03 as FQ24's
default says (avatars at 400 pixels wide, the others at 1290, JPEG quality 80). Their names are
invented in the book and identify no one.

| Asset | Book p50 | Unsplash photo id |
|---|---|---|
| `fixture-friends` | friends | 1529156069898-49953e39b3ac |
| `fixture-debby` | Debby avatar | 1534528741775-53994a69daeb |
| `fixture-ben` | Ben avatar | 1500648767791-00dcc994a43e |
| `fixture-maya` | Maya avatar | 1517841905240-472988babdf9 |
| `fixture-coffee` | coffee | 1442512595331-e89e73853f31 |
| `fixture-chair` | chair | 1598300042247-d088f8ab3a91 |
| `fixture-bread` | bread | 1509440159596-0249088772ff |
| `fixture-sea` | sea | 1473116763249-2faaef81ccda |
| `fixture-gardening` | gardening | 1416879595882-3373a0480b5b |
| `fixture-dog` | dog | 1543466835-00a7907e9de1 |

They live only in this asset catalog, which `project.yml` leaves out of the builds that point at
`prod` (the `Release` configuration's `EXCLUDED_SOURCE_FILE_NAMES`), and are used only by the Lab
and the tests: never in a build that points at `prod` (T46, FQ23, FQ24; `docs/TECH-DESIGN.md`
section 4). Slice 12's `ios-release` workflow checks a prod archive for them.

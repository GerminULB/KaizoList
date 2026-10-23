# The Kaizo List

**[kaizolist.com](https://kaizolist.com)** ranks the hardest legitimately beaten Kaizo levels in
[Ultimate Level Builder](https://berneyvonbean.itch.io/) and the players who beat them.

Every level on the list has a **KLP** value (Kaizo List Points) that reflects its difficulty. Players earn
**PLP** (Player List Points) from the levels they beat and verify. How both work is explained on the
[Rules page](https://kaizolist.com/Rules/).

## Features

- **Main List and Legacy List:** the top 100 levels with their KLP, badges, creators, verifiers and a
  thumbnail of each level. Levels past rgb(219, 66, 66) move to the Legacy List.
- **Level pages:** level info, victors, the full level layout, the level's history on the list,
  enjoyment ratings and comments.
- **Player Rankings and profiles:** every player's PLP, badges, victories, verifications and created levels.
- **Player Compare:** see how a player's PLP and rank would change if they beat a certain level.
- **Accounts:** sign in with Discord, pick your player name, or claim your existing record on the list.
- **Submissions:** send victories and verifications on the [Submit page](https://kaizolist.com/Submit/).
- **Enjoyment ratings:** players who beat or verified a level rate how fun it is from 0 to 10.
- **Comments** on level pages and profiles.
- **Carbo and hats:** every player has a Carbo as their profile picture, with hats from the game and
  special hats earned through achievements.
- **Admin panel** for the list team: submissions, KLP and badge requests, claims, the team and a full change log.

## How it works

The site is plain HTML, CSS and JavaScript, hosted on GitHub Pages. There is no build step.

The list itself (levels, players, submissions, ratings and comments) lives in **Firebase Firestore**, and
accounts use **Firebase Authentication** with Discord sign-in. Firebase has no Discord option built in, so a
small Cloud Function in `functions/` checks the Discord login and hands the browser a Firebase sign-in. The
site reads Firestore directly in the browser.

| Folder / file | What it is |
| --- | --- |
| `index.html` | The hub |
| `MainList/`, `PlayerList/`, `PlayerCompare/`, `Submit/`, `Rules/` | The site's pages |
| `LevelDetails.html`, `PlayerDetails.html` | Level and player pages |
| `Admin/` | The admin panel (team only) |
| `Discord/` | Where Discord sends people back after they sign in |
| `functions/` | The Cloud Function behind Discord sign-in |
| `LevelViewer/` | The level layout viewer used on level pages |
| `levels/` | Level layout files, named by level ID |
| `thumbs/` | Main List thumbnails |
| `history/` | Older snapshots of the list, used by the History timelines |
| `js/` | Shared scripts: data loading, accounts, comments, ratings, translations |
| `images/` | Badges, hats, UI sprites and icons |

## Running it locally

Serve the folder with any static file server, for example:

```
python -m http.server 8000
```

then open `http://localhost:8000`. The pages load their data from the live Firestore project.

## Translations

The site is available in English and Spanish. All texts are in `js/translation.js`; anything without a
Spanish translation falls back to English.

## Credits

Ultimate Level Builder and all of its assets belong to
[Berneyvonbean](https://berneyvonbean.itch.io/) ([YouTube](https://www.youtube.com/@Berneyvonbean)).

The Kaizo List is run by Germin ([YouTube](https://www.youtube.com/@GerminULB), hypergermented on Discord)
with the help of the List Admins. Join the [Kaizo List Discord server](https://discord.gg/3un6nh8G9w) to
submit records and talk about the list.

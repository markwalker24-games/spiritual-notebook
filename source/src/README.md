# Spiritual Notebook

A private notebook for impressions from prayer, scripture study and conference talks. Four ink colors, stars for things to share in quorum, to-do checkboxes, tags, and optional links to conference talks.

## How privacy works

Notes are saved only on each person's phone. There are no accounts and no server, so nobody else can read them, including the quorum presidency. The flip side: a lost or replaced phone means lost notes unless the person saved a backup (Settings › Save backup).

## Put it online (about 10 minutes, free)

This folder is a complete website. Any static host works. The easiest:

1. Go to https://app.netlify.com/drop and sign in (free).
2. Drag this whole folder onto the page.
3. Netlify gives you a web address. Optionally rename it under Site settings, e.g. `ourward-notebook.netlify.app`.

GitHub Pages and Cloudflare Pages work the same way. The site must be served over https.

## Share it with the quorum

Send the link. Each brother opens it on his phone and adds it to his Home Screen:

- **iPhone:** open in Safari › Share button › Add to Home Screen.
- **Android:** open in Chrome › menu › Add to Home screen (or Install app).

Adding it to the Home Screen matters on iPhone: Safari can clear data for sites that aren't used for a few weeks, but the Home Screen app keeps it.

## Set this Sunday's talk

Edit `talks.json` and upload the folder again:

```json
{
  "thisWeek": {
    "title": "Talk title",
    "speaker": "Speaker name",
    "date": "Oct 18",
    "url": "https://www.churchofjesuschrist.org/study/general-conference/..."
  },
  "conference": {
    "name": "October 2026 General Conference",
    "talks": [
      { "title": "Talk title", "speaker": "Speaker", "session": "Saturday morning", "url": "https://..." }
    ]
  }
}
```

The talk you put in `thisWeek` appears at the top of everyone's "Link a talk" list. Anyone can also type in a talk and link themselves.

## Changing the app

The editable source is in `source/src/`. Run `python3 source/build.py` to regenerate the site files at the top of the repo. If you change `index.html`, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Not in this version

The shared class features (live share board, polls, topic voting) need a small server, because they're shared between people. They can be added later without touching anyone's private notes.

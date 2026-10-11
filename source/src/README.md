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

## Post this Sunday's talk and questions

Each week, open `talks.json` on GitHub, click the pencil icon, edit, and click **Commit changes**. Within a few minutes it shows up as a "This Sunday in quorum" card at the top of everyone's notebook, marked **New** the first time they open the app after a change. Then post a quick "This week's questions are up" in WhatsApp.

```json
{
  "thisWeek": {
    "date": "Oct 18",
    "title": "Talk title",
    "speaker": "Speaker name",
    "url": "https://www.churchofjesuschrist.org/study/general-conference/...",
    "note": "Optional short message, e.g. Read the talk before Sunday.",
    "questions": [
      "First question?",
      "Second question?"
    ]
  },
  "conference": {
    "name": "October 2026 General Conference",
    "talks": [
      { "title": "Talk title", "speaker": "Speaker", "session": "Saturday morning", "url": "https://..." }
    ]
  }
}
```

Every field is optional; leave one blank ("") to hide it, or blank them all to hide the card. Each question gets a **Write** button that starts a private note with the question at the top, linked to the talk. Keep the quotes and commas exactly as shown: if the file has a typo, the card won't appear (GitHub shows a red warning on `.json` files with errors).

The talk you put in `thisWeek` also appears at the top of everyone's "Link a talk" list. Anyone can also type in a talk and link it themselves.

## Changing the app

The editable source is in `source/src/`. Run `python3 source/build.py` to regenerate the site files at the top of the repo. If you change `index.html`, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Not in this version

The shared class features (live share board, polls, topic voting) need a small server, because they're shared between people. They can be added later without touching anyone's private notes.

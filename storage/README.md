# Storage Layout

This directory keeps local runtime data for the knowledge-base app.

- `files/`: uploaded source files grouped by knowledge-base name
- `exports/`: exported Markdown or DOCX files
- `logs/`: local runtime logs
- `app.db`: local SQLite database, intentionally ignored from Git

The directory structure is tracked in Git, but runtime data files are not.

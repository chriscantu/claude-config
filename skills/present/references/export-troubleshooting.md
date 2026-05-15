# Export Troubleshooting

Used by `skills/present/SKILL.md` Step 6 (Export). Load on export failure.

If export fails because the theme is missing (cannot prompt for installation):

Start the dev server once first — it installs missing themes automatically:
```fish
cd ~/presentations/<slug> && bunx @slidev/cli slides.md
```
Then stop it (`Ctrl+C`) and re-run the export command.

If export fails because Chromium is unavailable:

1. Install Playwright's Chromium browser (one-time, ~92MB):
   ```fish
   bunx playwright install chromium
   ```
2. Re-run the export command.
3. If still failing: open `http://localhost:3030` and use browser print-to-PDF as fallback.
4. For PPTX: export requires Chromium. If unavailable, export PDF first and note the PPTX limitation.

Note: Slidev's PPTX export embeds slide images — the output is not text-editable in PowerPoint. This is acceptable for presentation use; if the recipient needs to edit the deck, deliver PDF instead.

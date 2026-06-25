# UI test 02 — Image upload (vision)

**Path:** canvas-rendered PNG → private Blob → route fetch-inline → Opus vision → render.
**Did:** injected a 54 KB PNG "photo" of an ER bill (TOTAL CHARGES $4,650, "Insurance not yet applied"); *"I took a photo of an ER bill I got in the mail. Is this what I owe?"*
**Result:** ✅ "IMG" chip rendered. Reply read the image text and said *"No — don't pay this yet… the key line: 'Insurance not yet applied'… the number you owe is whatever the EOB says, not this $4,650."* The image (vision) path works end-to-end through the real upload.

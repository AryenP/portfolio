# DSC 106 Lab 2 changes

Implemented on top of AryenP/portfolio:

- Constrained page width with `max-width: 100ch` and responsive centered margins.
- Converted navigation to Flexbox with equal-width links on desktop.
- Added `.current` navigation state to every page.
- Added accent color custom properties, hover/focus border, and subtle hover background.
- Converted the contact form to CSS Grid and used `subgrid` for aligned labels and controls.
- Converted the projects page to a responsive `repeat(auto-fill, minmax(15em, 1fr))` grid.
- Used row `subgrid` in project cards for horizontal alignment.
- Added strong responsive heading hierarchy and balanced heading wrapping.
- Added resume-specific responsive layout and typography.
- Preserved the existing personal content instead of replacing it with lorem ipsum.

Note: keep the existing `images/aryen-and-cat.jpg` file from the repository. This package changes HTML/CSS only.

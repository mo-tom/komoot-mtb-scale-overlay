# Komoot MTB Scale Overlay

A browser extension that adds MTB trail difficulty highlighting and a continuous slope-gradient overlay to planned routes on [Komoot](https://www.komoot.com/).

> Independent community project. Not affiliated with, endorsed by, or supported by Komoot.

## Features

- Highlights MTB trails by difficulty grade (S1, S2, S3, S4/S5).
- Customizable grade colors and trail thickness.
- Optional planned-route slope coloring from −100% to +100%.
- Adjustable legend and visibility settings.
- Supports Chrome and compatible Chromium browsers such as Brave.

## Installation (manual / developer mode)

The extension is not currently published in the Chrome Web Store.

1. Open the [latest release](https://github.com/mo-tom/komoot-mtb-scale-overlay/releases/latest) and download its ZIP file. If there is no release yet, click **Code → Download ZIP** on the repository page.
2. Extract the ZIP file.
3. Open `chrome://extensions` in Chrome or Brave.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `komoot-mtb-scale-extension` folder — the folder that directly contains `manifest.json`.
7. Open the extension's **Options** page to configure it.

## Configure MapTiler

The MTB trail layer uses MapTiler outdoor map data. A MapTiler API key is required for this overlay.

1. Create an account at [MapTiler Cloud](https://cloud.maptiler.com/).
2. Copy an API key from your account.
3. Open the extension's Options page and paste it into **MapTiler → API key**.
4. Click **Save settings**, then reload your Komoot tab.

The API key is stored in this browser's local extension storage. Do not commit a personal API key to this repository.

## Use the overlays

1. Open a planned route in Komoot.
2. In the map legend, toggle **MTB Scale** and individual grades as needed.
3. Enable **Route slope** in the legend to show the route gradient. You can also enable it in Options.
4. In Options, change the grade colors, line thickness, and legend visibility.
5. Reload the Komoot tab after changing Options.

The slope gradient uses route geometry and altitude data supplied by Komoot. Availability and display may change if Komoot changes its site implementation or API.

## Privacy and permissions

The extension runs on Komoot pages, reads route information needed to draw its overlays, and requests MapTiler map tiles. It stores display preferences and the MapTiler API key in local browser extension storage. It does not ask for your Komoot password or require you to sign into the extension.

Review the source and permissions in `komoot-mtb-scale-extension/manifest.json` before installing. MapTiler usage is subject to [MapTiler's terms](https://www.maptiler.com/terms/).

## Troubleshooting

- **No MTB trails are visible:** Check that a MapTiler API key is saved, then reload Komoot.
- **No slope coloring:** Make sure the slope overlay is enabled and open a planned route. If needed, recalculate or edit the route in Komoot.
- **Settings do not apply:** Save the options and reload the Komoot tab.
- **Komoot updates break the overlay:** Open an issue with your browser, whether you were viewing or editing a planned route, and steps to reproduce. Avoid posting private route links unless you are comfortable sharing them publicly.

## Development

The extension uses Manifest V3 and plain JavaScript/CSS. There is no build step. Load the `komoot-mtb-scale-extension/` directory as an unpacked extension to test changes.

## License

No license file is included yet, so standard copyright applies. Others do not automatically have permission to redistribute or modify the code. A license should be chosen before inviting community contributions.

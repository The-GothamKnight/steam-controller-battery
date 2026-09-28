# Steam Controller Battery

Steam Controller Battery is a Millennium plugin that adds a battery indicator
to the Steam desktop title bar for a supported Steam Controller.

## Features

- Battery percentage in the Steam title bar
- Charging, wireless, and synchronization status when Steam reports them
- Automatic hiding when the controller disconnects
- Title-bar integration
- Optional controller-state publishing for Xenon and TGK Steam

## Requirements

- Steam desktop client
- Millennium with Starlight plugin support
- A Steam Controller recognized by Steam's controller settings

## Installation

Once the plugin is available through Millennium's approved plugin catalogue,
install `steam-controller-battery` from Millennium and enable it in the
Plugins settings.

For a manual build, install the supplied `.star` package using Millennium's
local plugin installation workflow, then enable **Steam Controller Battery**
in the same settings page.

## Usage

Connect a supported Steam Controller. The indicator appears automatically in
the Steam title bar and shows its battery percentage. A lightning symbol marks
charging; the tooltip includes wireless and synchronization status when
available. The indicator disappears when the controller disconnects.

## Optional Xenon integration

When Xenon and the TGK Steam widget are installed, the plugin publishes the
same controller state through Xenon's local `scriptStates` service. Xenon is
optional: the Steam title-bar indicator works without it. See the [Xenon
website](https://xenon-app.com/) and [Xenon GitHub repository](https://github.com/marcimastro98/Xenon)
for official resources.

## Compatibility and limitations

Steam client UI changes can occasionally require a plugin update. A hard
process termination or crash cannot guarantee publication of the final
disconnected Xenon state.

## Privacy and network behavior

The plugin reads controller state locally from Steam. It sends no telemetry and
requires no account credentials. If Xenon integration is available, it only
communicates with Xenon's local service on the same computer.

## License

Released under the [MIT License](LICENSE).

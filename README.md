# Simple Gnome Shell Extension for Home Assistant

This is a simple gnome shell extension which allows you to control your home assistant setup from your gnome desktop. 

Currently, the extension only supports temperature (and humidity) sensors and also toggling lights or switches. In addition, 
you can also use this extension in order to send `start`, `stop` or `close` events to your Home Assistant instance. 

## Installation

TODO

## How to Use

**Note:** Whenever you make any changes to your preferences/settings you will need to restart your session. 
- On `Xorg` you can do that by pressing `Alt+F2` and then `r`.
- On `Wayland` you will have to logout and re-login.

If you are unsure about whether you have `Xorg` or `Wayland` then simply try the `Xorg` option and see if it works.

### Manage your Preferences

After installing the extension, you can use the preferences widget in order to customize it. In order to do that, you can either open `gnome-tweaks` and go to the `Extensions` tab and select the settings for this extension, or you can simply open the panel menu by pressing on the home assistant icon and then press `Preferences`.

### Authentication

In order to communicate with `Home Assistant` you will need to provide a `Long Live Access Token` which you can get from your *dashboard &#8594; profile (on the bottom left) &#8594; Long Live Access Tokens (on the bottom of the page)&#8594; Create Token*. 

After that, copy the token and add it in the in the text box below the `Access Token:` entry on the preferences menu.

In addition, you need to provide the url of your hass instance on the `URL` box.

### Appearance

#### Panel Appearance

The panel will contain the following 2 entries (after configuring the temperature). *Note: The red line is there just to emphasize the icons.*

![Panel Appearance](screenshots/panel_icons.png?raw=true "How the panel icons appear.")

By pressing the temperature buttons you can refresh the temperature.

#### Opening the Menu

If you click the home assistant icon, you will get the following:

![Hass Opened](screenshots/panel_menu.png?raw=true "How the panel menu appears.")

Here, I have added 2 togglable entities. One for my kitchen lights and one for my TV. By pressing any of these buttons, its state will toggle.

The names of these entries is always of the format: `Toggle: Name` where `Name` is taken by removing the part before the `.` (e.g. remove `switch.`) and then replacing the underscore with a space and capitalizing each letter.

So, for example, the entity id `switch.kitchen_lights` became `Kitchen Lights`.


#### Home Assistant Events

By pressing `Hass Events` a new sublist will appear:


![Hass Events](screenshots/hass_events.png?raw=true "How the hass events appear.")
#### Preferences (Settings)

By pressing the `Preferences` button you will get the following:


![Preferences](screenshots/preferences_menu.png?raw=true "How the preferences/settings appear.")

Here, you can see the entity ids of my kitchen lights and my tv switch. 

In order to add a new entity id, you can simply copy the id in the text box after the `New Entity ID` text and then press `Add Entity ID`.

### Handle Weather Statistics

Initially, you will see the entry `false | false` in the panel. This means that the temperature entity id(s) has not been set. In order to do that, open the preferences menu as described above.

#### Adding Temperature Sensor

Then, go to the `Temperature Entity ID` line and add the entity id of your temperature sensor. If you don't know it then go to the configuration page of your Home Assistance instance (bottom left) and then press the `Entities` entry. The id should look something like this: `sensor. livingroom_temperature`.

#### Adding Humidity Sensor

You can do the same for your humidity sensor and add it under the `Humidity Entity ID` line.

#### Removing Weather Statistics

If you don't have any temperature sensors then you can remove this panel by turning off the `Show Weather` switch (in the preferences menu). 

If you only want to see the temperature and not the humidity, then you can also do that by turning off the `Show Humidity` switch.

## Notes:

1. Before starting check the preferences page by opening the widget (pressing the home assistant button on the panel) and pressing `Preferences`. There you can add as many (valid) entities as you want. 
2. The entities **MUST** include a dot (`.`) and at least one underscore (`_`). For example, an entity id could be: `switch.kitchen_lights_relay`.


## Credits

My implementation is based on the following:

- **Codeproject Tutorial**: [How to Create A GNOME Extension](https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension)
- **Github Repo**: [TV Switch - Gnome Shell Extension](https://github.com/geoph9/tv-switch-gnome-shell-extension).
- **Caffeine Extension**: [Caffeine](https://github.com/eonpatapon/gnome-shell-extension-caffeine)
- **GameMode Extension**: [GameMode](https://github.com/gicmo/gamemode-extension)
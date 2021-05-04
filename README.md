# Simple Gnome Shell Extension for Home Assistant

This is a simple gnome shell extension which allows you to control your home assistant setup from your gnome desktop. 

Currently, the extension only supports temperature (and humidity) sensors and also toggling lights or switches. In addition, 
you can also use this extension in order to send `start`, `stop` or `close` events to your Home Assistant instance. 

**Note:** Supports Gnome 40 and Gnome 3.38.

## Contents

- [Installation](#installation)
    - [Installing from Releases (Recommended)](#installing-from-releases)
    - [Installing from Source](#installing-from-source)
    - [Installing from Gnome Extensions](#installing-from-gnome-extensions)
    - [Gnome Version](#gnome-version)
- [Updating](#updating)
- [How to Use](#how-to-use)
    - [Manage your Preferences](#manage-your-preferences)
    - [Authentication](#authentication)
    - [Appearance](#appearance)
- [Security](#security)
- [Removing the Extension](#removing-the-extension)
- [Notes](#notes)
- [Credits](#credits)


## Installation

### Installing from Releases

You can also download the extension from the [release page](https://github.com/geoph9/hass-gshell-extension/releases) (pick the release corresponding
to your gnome-shell version). 

In order automate the process, I have created the script `build.sh` which will download the release corresponding to you current `gnome-shell` version. You don't have to clone the whole repo. It suffices to download the `build.sh` script and run it.

```bash
#Download build.sh and give execution rights
wget https://raw.githubusercontent.com/geoph9/hass-gshell-extension/master/build.sh && chmod +x build.sh

# Download and "install" hass-gshell-extension 
./build.sh

# Get help message
# ./build.sh -h
```

After that, you will have to restart your session (e.g. `Alt+F2` -> `r+Enter` on Xorg or simply logout and re-login on Wayland) and then you will 
need to enable the extension. The enabling part can be done either from the terminal (`gnome-extensions enable hass-gshell@geoph9-on-github`) or 
from an app such as `Extensions` (available as a flatpak).

### Installing from Source

In order to install the extension you will have to clone this repository and move it under the directory where your other extensions are. The following commands should make it work:

```bash
# Create the extensions directory in case it doesn't exist
mkdir -p "$HOME"/.local/share/gnome-shell/extensions
git clone https://github.com/geoph9/hass-gshell-extension.git "$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
```

Then open Gnome Tweaks (or the Extensions app on Gnome 40) and enable the extension.

**Note:** Ubuntu 21.04 will not ship with `Gnome 40` and so you will still need to use the `Gnome 3.38` version. For installation instructions
check the example in the [Installing from Release](#installing-from-release) subsection.

### Installing from Gnome Extensions

The extension is also available at the [Gnome Extensions (e.g.o.)](https://extensions.gnome.org/extension/4170/home-assistant-extension/) website 
with the name *Home Assistant Extension*. 

The versions there will not be updated very often and so you may miss some features if you choose to use the e.g.o. website. That is why, the recommended [installation method is from the release page](#installing-from-releases).

### Gnome Version

Below are the `gnome-shell` versions that each branch supports: 

- `[master]`: Gnome 40
- `[gnome3.38]`: Gnome 3.38
- `[gnome40]`: Development branch of Gnome 40

## Updating

If you installed the extension from the [release page](https://github.com/geoph9/hass-gshell-extension/releases), you should simply re-run the the `build.sh` script.

If you installed from source, then you will have to pull the changes from the master branch as follows:

```bash
cd $HOME/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github && git pull origin master
```

*TODO: Maybe add an update button on the settings menu.*

## How to Use

### Manage your Preferences

After installing the extension, you can use the preferences widget in order to customize it. In order to do that, you can open the panel menu by pressing on the home assistant tray icon and then press `Preferences`.

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

Here, I have added 2 togglable entities. One for my kitchen lights and one for my TV. By pressing any of these buttons, its state will toggle. The names of these entries are taken from home assistant.

**NOTE:** The menu can also be opened (toglled)by using the `Super+G` shortcut.This may make it easier for you to toggle something without using the mouse/touchpad. It is not possible (currently) to change this shortcut key (unless you change the schema file and re-compile it or use something like dconf).


#### Home Assistant Events

By pressing `Hass Events` a new sublist will appear:


![Hass Events](screenshots/hass_events.png?raw=true "How the hass events appear.")
#### Preferences (Settings)

**NOTE:** On Gnome 40 the Preferences menu is slightly different but offers the same functionality.

By pressing the `Preferences` button you will get the following:


![Preferences](screenshots/preferences_menu.png?raw=true "How the preferences/settings appear.")

Here, you can see the entity ids of my kitchen lights and my tv switch. 

In order to add a new entity id, you can simply copy the id in the text box after the `New Entity ID` text and then press `Add Entity ID`. To delete an entity, select its name and press the delete icon (on the bottom left).

### Temperature/Humidity Sensors

If the "Show Weather" option is set to True, you will see the entry `false | false` in the panel. This means that the temperature's entity id has not been set. In order to do that, open the preferences menu as described above.

#### Adding Temperature Sensor

Change the `Temperature Entity ID` line and add the entity id of your temperature sensor. If you don't know it then go to the configuration page of your Home Assistance instance (bottom left) and then press the `Entities` entry. The id should look something like this: `sensor.livingroom_temperature`.

#### Adding Humidity Sensor

You can do the same for your humidity sensor and add it under the `Humidity Entity ID` line.

### Refreshing Weather Statistics

By default, the weather statistics will be refreshed only when you press their values. This can be changed by going to the `Preferences` and switching on the `Refresh Weather Statistics` option.

In addition, you can also set the refresh rate (in seconds) for getting the new statistics from your Home Assistant Instance.

#### Removing Weather Statistics

If you don't have any temperature sensors, then you can remove this panel by turning off the `Show Weather` switch (in the preferences menu). 

If you only want to see the temperature and not the humidity, then you can also do that by turning off the `Show Humidity` switch.

## Security

I am using the `Secret` library in order to store the access token in the running secret service (like gnome-keyring or ksecretservice) [source](https://developer.gnome.org/libsecret/unstable/js-store-example.html). This makes it safer to use your access token since it is more difficult to have it stolen by a third party. So, your token is as safe as your current user (this means that if a third party knows your user password and has access to your machine then they can theoretically get the token, but if that is the case then you probably have more improtant things to worry about).

In general, if you think that you have an exposed access token, then you should go to your profile and delete it. Pay attention to this especially if you are hosting your instance on the internet (and not locally).


## Removing the Extension

If you followed the installation instructions above then you can do the following:

```bash
rm -rf $HOME/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
```

You will also have to restart your session in order to have the panel buttons dissapear.


## Notes:

1. Before starting check the preferences page by opening the widget (pressing the home assistant button on the panel) and pressing `Preferences`. There you can add as many (valid) entities as you want. 
2. The entities **MUST** include a dot (`.`) and at least one underscore (`_`). For example, an entity id could be: `switch.kitchen_lights_relay`.
3. Changing the preferences should have an immediate effect on the extension (in most cases). But, there is a bug that doesn't allow me to change right away the togglable entities you add on the Preferences menu. So, whenever you want to add a new entity (or delete one) you will need to restart your session. 
    - On `Xorg` you can do that by pressing `Alt+F2` and then `r`.
    - On `Wayland` you will have to logout and re-login.
4. Whenever changing/adding a new Access Token you will need to restart your session just as shown above.

If you are unsure about whether you have `Xorg` or `Wayland` then simply try the `Xorg` option and see if it works.


## Credits

My implementation is based on the following:

- **Codeproject Tutorial**: [How to Create A GNOME Extension](https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension)
- **Github Repo**: [TV Switch - Gnome Shell Extension](https://github.com/geoph9/tv-switch-gnome-shell-extension).
- **Caffeine Extension**: [Caffeine](https://github.com/eonpatapon/gnome-shell-extension-caffeine)
- **GameMode Extension**: [GameMode](https://github.com/gicmo/gamemode-extension)

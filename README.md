# Simple Gnome Shell Extension for Home Assistant

This is a simple gnome shell extension which allows you to control your home assistant setup from your gnome desktop. 

Currently, the extension supports temperature (and humidity) sensors, toggling lights and switches and turning on scenes and scripts. 
In addition, you can also use this extension in order to send `start`, `stop` or `close` events to your Home Assistant instance. 

## Contents

- [Installation](#installation)
    - [Direct Install (Recommended)](#direct-install)
    - [Installing from Source](#installing-from-source)
    - [Installing from Gnome Extensions](#installing-from-gnome-extensions)
- [How to Use](#how-to-use)
    - [Manage your Preferences](#manage-your-preferences)
    - [Authentication](#authentication)
- [Appearance](#appearance)
    - [Panel Appearance](#panel-appearance)
    - [Opening the Menu](#opening-the-menu)
    - [Preferences (Settings)](#preferences-settings)
    - [Changing the Togglables](#changing-the-togglables)
- [Security](#security)
- [Updating](#updating)
- [Removing the Extension](#removing-the-extension)
- [Feature Requests](#feature-requests)
- [Notes](#notes)
- [Credits](#credits)


## Installation

### Direct Install

The script `build.sh` aims at helping you download and install the extension. Its default behavior will simply download the latest release corresponding to your gnome version. If you want to have the latest changes directly from the `master` branch then you can provide the `--latest` argument. Example usage is shown below:

```bash
# Download build.sh and give execution rights
wget https://raw.githubusercontent.com/geoph9/hass-gshell-extension/master/build.sh && chmod +x build.sh

# Download and install hass-gshell@geoph9-on-github from the releases
./build.sh

# # Download and install the latest version directly from master.
# # This makes it a bit more possible to encounter some bug.
# # If you do so, please make an issue on github!
# ./build.sh --latest  # or simply -l

# # Get help message
# ./build.sh -h

# Delete the build.sh script since you no longer need it.
rm ./build.sh
```

After that, you will have to restart your session (e.g. `Alt+F2` -> `r+Enter` on Xorg or simply logout and re-login on Wayland) and then you will 
need to enable the extension. The enabling part can be done either from the terminal (`gnome-extensions enable hass-gshell@geoph9-on-github`) or 
from an app such as `Extensions` (available as a flatpak) or from the [`Gnome Extensions` website](https://extensions.gnome.org/).

**NOTE:** The script simply downloads the extension's files either from github or fromt he realeases page. You can check that yourself. If you still don't trust running the script, then you follow the steps below.

### Installing from Source

In order to install the extension you will have to clone this repository and move it under the directory where your other extensions are. The following commands should make it work:

```bash
# Create the extensions directory in case it doesn't exist
mkdir -p "$HOME"/.local/share/gnome-shell/extensions
git clone https://github.com/geoph9/hass-gshell-extension.git "$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
```

Then open Gnome Tweaks (or the Extensions app on Gnome >=40) and enable the extension.

**Note:** Ubuntu 21.04 does not ship with `Gnome 40` and so you will still need to use the `Gnome 3.38` version. You can install that by using the `build.sh` script above, with the default settings.

### Installing from Gnome Extensions

The extension is also available at the [Gnome Extensions (e.g.o.)](https://extensions.gnome.org/extension/4170/home-assistant-extension/) website 
with the name *Home Assistant Extension*. 

The versions there will not be updated very often and so you may miss some features if you choose to use the e.g.o. website. That is why, the recommended [installation method is from the release page](#installing-from-releases).

## How to Use

### Manage your Preferences

After installing the extension, you can use the preferences widget in order to customize it. In order to do that, you can open the panel menu by pressing on the home assistant tray icon and then press `Preferences`.

### Authentication

In order to communicate with `Home Assistant` you will need to provide a `Long Live Access Token` which you can get from your *dashboard &#8594; profile (on the bottom left) &#8594; Long Live Access Tokens (on the bottom of the page)&#8594; Create Token*. 

After that, copy the token and add it in the in the text box below the `Access Token:` entry on the preferences menu.

In addition, you need to provide the url of your hass instance on the `URL` box. 

## Appearance

### Panel Appearance

The panel will contain the following 2 entries (after configuring the temperature). *Note: The red line is there just to emphasize the icons.*

![Panel Appearance](screenshots/panel_icons_40.png?raw=true "How the panel icons appear.")

By pressing the temperature buttons you can refresh the temperature.

**Note: You can change the panel icon from the preferences menu. Currently only a blue and a white icon is supported. The white icon is the default.**

### Opening the Menu

If you click the home assistant icon, you will get the following:

![Hass Opened](screenshots/panel_menu_40.png?raw=true "How the panel menu appears.")

In this example, I have added 2 togglable entities that control my kitchen lights and my TV power. By pressing any of these buttons, its state will toggle. The names of these entries are taken from home assistant.

**NOTE:** The menu can also be opened (toglled)by using the `Super+G` shortcut.This may make it easier for you to toggle something without using the mouse/touchpad. It is not possible (currently) to change this shortcut key (unless you change the schema file and re-compile it or use something like dconf).  **UPDATE: This feature is removed now.**


#### Home Assistant Events

By pressing `Hass Events` a new sublist will appear:


![Hass Events](screenshots/hass_events_40.png?raw=true "How the hass events appear.")

### Preferences (Settings)

**NOTE:** This is for Gnome >=40. Gnome 3.38 has a different menu but with similar functionality.

By pressing the `Preferences` button you will get the following:


![Preferences](screenshots/general_settings.png?raw=true "How the preferences/settings appear.")

Currently, there are four pages. Generic settings, togglables (lights/switches), runnables (scenes/scripts) and sensors.
In the general settings, you are prompted to enter the URL and Long-Live Access Token of your Home Assistant instance.

The rest of the options are self-describing. About the temperature and humidity id, they are only needed if the 
`Show Temperature/Humidity` and `Show Humidity` switches are on. Otherwise, you can still use the extension by 
using only the toggles or runnables. Theoretically, you can put any kind of sensor in these spots 
(but I haven't tested any other kind of sensor).

**Note:** The `Hass White Icon` is the default Icon option and it is the classical home-assistant icon without any color. This integrates better with the rest of the icons in your panel. In the screenshots above I am using the `Hass Blue Icon`.

**Note:** The Long Live Access Token can be obtained by going to your Home Assistant dashboard, then to your profile (on the bottom) and then go to the bottom of the page and create a new Long Live Access Token. More information about it [on the oficial Home Assistant website](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token).

**Note:** The options to refresh the temperature/humidity statistics are currently not working.

### Changing the Togglables and Runnables

If you click the `Togglables` page on the side you will get the following:

![Preferences](screenshots/togglable_settings.png?raw=true "How the togglable settings appear.")

The extension will scan your home assistant instance in order to find all of the entities that are either switches or lights. These entities will be listed here. In my case, I only have 
two togglable entities and I use both of them. If I unchecked the switch.kitchen_lights entry then the option would also be removed from the extension's panel.

By default, all togglables will appear. If you only want a subset of the switches, you can do that here. 

The same applies to the `Runnables` page with scene and script entities.

## Security

I am using the `Secret` library in order to store the access token in the running secret service (like gnome-keyring or ksecretservice) [source](https://developer.gnome.org/libsecret/unstable/js-store-example.html). This makes it safer to use your access token since it is more difficult to have it stolen by a third party. So, your token is as safe as your current user (this means that if a third party knows your user password and has access to your machine then they can theoretically get the token, but if that is the case then you probably have more improtant things to worry about).

In general, if you think that you have an exposed access token, then you should go to your profile and delete it. Pay attention to this especially if you are hosting your instance on the internet (and not locally).

## Updating

If you installed the extension from the [release page](https://github.com/geoph9/hass-gshell-extension/releases), you should simply re-run the the `build.sh` script.

If you installed from source, then you will have to pull the changes from the master branch as follows:

```bash
cd $HOME/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github && git pull origin master
```

If you installed from the [Gnome Extensions (e.g.o.)](https://extensions.gnome.org/extension/4170/home-assistant-extension/) website and there is an update available, then you will be prompted to update whenever you visit the website.

## Removing the Extension

If you followed the installation instructions above then you can do the following:

```bash
rm -rf $HOME/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
```

You will also have to restart your session in order to have the panel buttons dissapear.

## Feature Requests

For feature requests please create a new issue and describe what you want. I will be happy to try and implement it (or you can implement it yourself in then make a PR).

## Notes:

1. Before starting check the preferences page by opening the widget (pressing the home assistant button on the panel) and pressing `Preferences`. There you can add as many (valid) entities as you want. 
2. On Gnome 3.38, the entities **MUST** include a dot (`.`) and at least one underscore (`_`). For example, an entity id could be: `switch.kitchen_lights_relay`.
3. On Gnome 3.38, changing the preferences doesn't update togglable entities and you will need to restart your session for the changes to take effect. 
    - On `Xorg` you can do that by pressing `Alt+F2` and then `r`.
    - On `Wayland` you will have to logout and re-login.

If you are unsure about whether you have `Xorg` or `Wayland` then simply try the `Xorg` option and see if it works.


## Credits

My implementation is based on the following:

- **Codeproject Tutorial**: [How to Create A GNOME Extension](https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension)
- **Github Repo**: [TV Switch - Gnome Shell Extension](https://github.com/geoph9/tv-switch-gnome-shell-extension).
- **Caffeine Extension**: [Caffeine](https://github.com/eonpatapon/gnome-shell-extension-caffeine)
- **GameMode Extension**: [GameMode](https://github.com/gicmo/gamemode-extension)
- **Custom Hot Corners Extended (forked extension)**: [Custom Hot Corners Extended](https://github.com/G-dH/custom-hot-corners-extended)


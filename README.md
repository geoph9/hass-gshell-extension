# Simple Gnome Shell Extension for Home Assistant

This is a simple gnome shell extension which allows you to control your home assistant setup from your gnome desktop. 

Currently, you will need to write some code and make some changes in order to make it work on your setup. This is due to the fact that I have hard-coded the urls. My plan in to make the urls changable from a settings menu which I have not yet started.

My implementation is based on [this codeproject tutorial](https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension) and on another (similar) extensions I recently made for switching my tv on and off ([link](https://github.com/geoph9/tv-switch-gnome-shell-extension)).

## Notes:

1. You may need to create a `data` directory (in the same directory where `extension.js` is).
2. TODO: Add the schema. The reason it is not there now is because the Long Live Access token is visible.
3. You will need to have a file named `org.gnome.shell.extensions.hass-data.gschema.xml` under the `schemas` directory (todo: This should be done by `prefs.js`). After creating it, make sure you have compiled the file with the following command: `glib-compile-schemas schemas/`.
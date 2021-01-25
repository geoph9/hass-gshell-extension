# Simple Gnome Shell Extension for Home Assistant

This is a simple gnome shell extension which allows you to control your home assistant setup from your gnome desktop. 

Currently, you will need to write some code and make some changes in order to make it work on your setup. This is due to the fact that I have hard-coded the urls. My plan in to make the urls changable from a settings menu which I have not yet started.

My implementation is based on [this codeproject tutorial](https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension) and on another (similar) extensions I recently made for switching my tv on and off ([link](https://github.com/geoph9/tv-switch-gnome-shell-extension)).

## Notes:

1. Before starting check the preferences page by opening the widget (pressing the home assistant button on the panel) and pressing `Preferences`. There you can add as many (valid) entities as you want. 
2. The entities should include a dot (`.`) and at least one underscore (`_`). For example, an entity id could be: `switch.kitchen_lights_relay`.
3. After you add your entities, you should restart your session. 
    - If you are on Wayland then you will have to logout and re-login. 
    - On Xorg, you simply have to press `Alt+F2` and then `r`.

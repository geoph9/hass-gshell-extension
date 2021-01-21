// Taken from: https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

const Me = imports.misc.extensionUtils.getCurrentExtension();

const {Gio, Shell, Meta, St, Clutter} = imports.gi;
const Main = imports.ui.main;

const GObject = imports.gi.GObject;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Utils = Me.imports.utils;
const Util = imports.misc.util;
const Soup = imports.gi.Soup;

let panelButton;

let base_url, access_token;

let myPopup;

const GLib = imports.gi.GLib;
// let now = GLib.DateTime.new_now_local();
// let nowString = now.format("%Y-%m-%d %H:%M:%S");

// e.g. notify
//Main.notify('Message Title', 'Message Body');

// const Mainloop = imports.mainloop;
// let timeout = Mainloop.timeout_add_seconds(2.5, () => {
//   // this function will be called every 2.5 seconds
// });
// // remove mainloop
// Mainloop.source_remove(timeout);

const MyPopup = GObject.registerClass(
    class MyPopup extends PanelMenu.Button {

        _init () {

            super._init(0);

            let icon = new St.Icon({
                gicon : Gio.icon_new_for_string( Me.dir.get_path() + '/icons/hass-main.png' ),
                style_class : 'system-status-icon',
            });

            this.add_child(icon);

            let pmItem = new PopupMenu.PopupMenuItem('Normal Menu Item');
            pmItem.add_child(
                new St.Label({
                    text : 'Label added to the end'
                })
            );
            this.menu.addMenuItem(pmItem);

            pmItem.connect('activate', () => {
                log('clicked');
                let path = test_cmd(`${base_url}api/states/sensor.livingroom_temperature`);
                let json_result = read_json(path);
                log("test_cmd done.");
            });

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this.menu.addMenuItem(
            new PopupMenu.PopupMenuItem(
                "User cannot click on this item",
                {reactive : false},
            )
            );

            this.menu.connect('open-state-changed', (menu, open) => {
            if (open) {
                log('opened');
            } else {
                log('closed');
            }
            });

            // sub menu
            let subItem = new PopupMenu.PopupSubMenuMenuItem('sub menu item');
            this.menu.addMenuItem(subItem);
            subItem.menu.addMenuItem(new PopupMenu.PopupMenuItem('item 1'));
            subItem.menu.addMenuItem(new PopupMenu.PopupMenuItem('item 2'), 0);

            // section
            let popupMenuSection = new PopupMenu.PopupMenuSection();
            popupMenuSection.actor.add_child(new PopupMenu.PopupMenuItem('section'));
            this.menu.addMenuItem(popupMenuSection);

            // image item
            let popupImageMenuItem = new PopupMenu.PopupImageMenuItem(
            'Menu Item with Icon',
            'security-high-symbolic',
            );
            this.menu.addMenuItem(popupImageMenuItem);

            // you can close, open and toggle the menu with
            // this.menu.close();
            // this.menu.open();
            // this.menu.toggle();
        }
    }
);

// Credits: https://stackoverflow.com/questions/43357370/gnome-extensions-run-shell-command#44535210
function test_cmd(url, type='GET') {
    let name = url.split("/");
    name = name[name.length - 1];
    name = type.toLowerCase() + "_" + name;
    name = name.replace(".", "_");  // because the entity_id contains a dot.
    path = `${Me.dir.get_path()}/data/${name}.json`;
    log("Pinging URL: " + url);
    Util.spawnCommandLine(`/usr/bin/curl -X ${type} -H "Authorization: Bearer ${access_token}" -H "Content-Type: application/json" ${url} -o ${path}`);
    return path;
}

function read_json(path) {
    let text = GLib.file_get_contents(path)[1];
    let json_result = JSON.parse(text);
    return json_result;
}

function init() {
    // Create a Button with "Hello World" text
    panelButton = new St.Bin({
        style_class : "panel-button",
    });
    let panelButtonText = new St.Label({
        text : "Hello World",
        y_align: Clutter.ActorAlign.CENTER,
    });
    panelButton.set_child(panelButtonText);
}

function enable () {
    let settings = Utils.getSettings('hass-data');
    // Can also use settings.set_string('...', '...');
    base_url = settings.get_string('hass-url');
    access_token = settings.get_string('hass-access-token');
    
    // let _httpSession = new Soup.Session();
    // let message = Soup.form_request_new_from_hash('GET', url, {});
    // message.request_headers.append("X-Authorization-key", TW_AUTH_KEY);


    // Add the button to the panel
    Main.panel._rightBox.insert_child_at_index(panelButton, 0);

    // Popup menu
    myPopup = new MyPopup();
    Main.panel.addToStatusArea('myPopup', myPopup, 1);

    // For the Shortcut
    // Shell.ActionMode.NORMAL
    // Shell.ActionMode.OVERVIEW
    // Shell.ActionMode.LOCK_SCREEN
    let mode = Shell.ActionMode.ALL;

    // Meta.KeyBindingFlags.PER_WINDOW
    // Meta.KeyBindingFlags.BUILTIN
    // Meta.KeyBindingFlags.IGNORE_AUTOREPEAT
    let flag = Meta.KeyBindingFlags.NONE;

    let shortcut_settings = Utils.getSettings('hass-shortcut');

    Main.wm.addKeybinding("hass-shortcut", shortcut_settings, flag, mode, () => {
        log('shortcut is working');
    });
}

function disable () {
    // Remove the added button from panel
    Main.panel._rightBox.remove_child(panelButton);

    myPopup.destroy();

    // Disable shortcut
    Main.wm.removeKeybinding("hass-shortcut");
}

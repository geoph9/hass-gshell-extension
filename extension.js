// Taken from: https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gio = imports.gi.Gio;

const {St, Clutter} = imports.gi;
const Main = imports.ui.main;

const GObject = imports.gi.GObject;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const Utils = Me.imports.utils;
const Soup = imports.gi.Soup;

let panelButton;

let url, access_token;

let myPopup;

// const GLib = imports.gi.GLib;
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

function init () {
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
    let settings = Utils.getSettings();
    // Can also use settings.set_string('...', '...');
    url = settings.get_string('hass-url');
    access_token = settings.get_string('hass-access-token');
    
    // let _httpSession = new Soup.Session();
    // let message = Soup.form_request_new_from_hash('GET', url, {});
    // message.request_headers.append("X-Authorization-key", TW_AUTH_KEY);


    // Add the button to the panel
    Main.panel._rightBox.insert_child_at_index(panelButton, 0);

    // Popup menu
    myPopup = new MyPopup();
    Main.panel.addToStatusArea('myPopup', myPopup, 1);
}

function disable () {
    // Remove the added button from panel
    Main.panel._rightBox.remove_child(panelButton);

    myPopup.destroy();
}

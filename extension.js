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

// MainLoop for updating the time every X seconds.
const Mainloop = imports.mainloop;

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

let soupSyncSession = new Soup.SessionSync();


// Taken from tv-switch-gnome-shell-extension repo
let refreshTimeout;
// Weather-Related Variables / Endpoints
let currentStats;  // a dictionary with 2 keys (temperature and humidity).
let weatherStatsPanel;
let weatherStatsPanelText;

// POPUP MENU
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
                // send_request(`${base_url}api/states/sensor.livingroom_temperature`, 'GET')
            });

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem(
                    `Livingroom Temperature: ${getWeatherSensorData('livingroom', 'temperature')}`,
                    {reactive : false},
                )
            );

            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem(
                    `Livingroom Humidity: ${getWeatherSensorData('livingroom', 'humidity')}`,
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


/* =======================================================
   ===================== WEATHER =========================
   =======================================================
*/
// TODO: The humidity is not so important and so there should be an option at prefs.js in order to remove it.
function _refreshWeatherStats() {
    temperature = getWeatherSensorData('livingroom', 'temperature');
    humidity = getWeatherSensorData('livingroom', 'humidity');
    try {
        weatherStatsPanelText.text = `${temperature} | ${humidity}`;
    } catch (error) {
        logError(error);
        disable();
    }
    // will execute this function only once and abort. Remove in order to make the Main loop work
    return false; 
}

function getWeatherSensorData(area, sensor_name) {
    let json_result = send_request(`${base_url}api/states/sensor.${area}_${sensor_name}`);
    if (!json_result) {
        return false;
    }
    return `${json_result.state} ${json_result.attributes.unit_of_measurement}`;
}

/* =======================================================
   ================= REQUESTS TO HASS ====================
   =======================================================
*/

// // Credits: https://stackoverflow.com/questions/43357370/gnome-extensions-run-shell-command#44535210
// function send_request(url, type='GET') {
//     let name = url.split("/");
//     name = name[name.length - 1];
//     name = type.toLowerCase() + "_" + name;
//     name = name.replace(".", "_");  // because the entity_id contains a dot.
//     path = `${Me.dir.get_path()}/data/${name}.json`;
//     log("Pinging URL: " + url);
//     Util.spawnCommandLine(`/usr/bin/curl -X ${type} -H "Authorization: Bearer ${access_token}" -H "Content-Type: application/json" ${url} -o ${path}`);
//     return path;
// }

// function read_json(path) {
//     let text = GLib.file_get_contents(path)[1];
//     let json_result;
//     try {
//         json_result = JSON.parse(text);
//     } catch (e) {
//         log("ERROR:")
//         log(e);
//         return false;
//     }
//     return json_result;
// }

// Credits: https://stackoverflow.com/questions/65830466/gnome-shell-extension-send-request-with-authorization-bearer-headers/65841700
function send_request(url, type='GET') {
    let message = Soup.Message.new(type, url);
    message.request_headers.append(
        'Authorization',
        `Bearer ${access_token}`
    )
    message.request_headers.set_content_type("application/json", null);
    let responseCode = soupSyncSession.send_message(message);

    if(responseCode == 200) {
        try {
            return JSON.parse(message['response-body'].data);
        } catch(error) {
            log("ERROR OCCURRED WHILE SENDING GET REQUEST TO " + url + ". ERROR WAS: " + error);
        }
    }
    return false;
}

function init() {
    // Add the temperature in the panel
    weatherStatsPanel = new St.Bin({
        style_class : "panel-button",
        reactive : true,
        can_focus : true,
        track_hover : true,
        height : 30,
    });
}

function enable () {
    /* =======================================================
       ================== POPUP MENU AREA ====================
       =======================================================
    */
    
    let settings = Utils.getSettings('hass-data');
    // Can also use settings.set_string('...', '...');
    base_url = settings.get_string('hass-url');
    access_token = settings.get_string('hass-access-token');

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

    /**
     * ===== Weather Area ======
     */
    weatherStatsPanelText = new St.Label({
        text : "-°C",
        y_align: Clutter.ActorAlign.CENTER,
    });
    _refreshWeatherStats();
    weatherStatsPanel.set_child(weatherStatsPanelText);
    weatherStatsPanel.connect("button-press-event", () => {
        _refreshWeatherStats();
    });

    // Update weather stats every 1 minute
    // refreshTimeout = Mainloop.timeout_add_seconds(160, () => {
    //         _refreshWeatherStats();
    //     }    
    // );

    Main.panel._rightBox.insert_child_at_index(weatherStatsPanel, 1);
}

function disable () {
    myPopup.destroy();

    // Disable shortcut
    Main.wm.removeKeybinding("hass-shortcut");

    Main.panel._rightBox.remove_child(weatherStatsPanel);
    // TODO: Not sure if the timeout_add_seconds function stops refresing when disable is called. Check it.
    // remove mainloop
    // Mainloop.source_remove(refreshTimeout);
}

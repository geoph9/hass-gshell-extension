// Taken from: https://www.codeproject.com/Articles/5271677/How-to-Create-A-GNOME-Extension

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const {Gio, Shell, Meta, St, Clutter, Secret} = imports.gi;
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

let base_url, access_token, togglable_ent_ids;

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
let weatherStatsPanel;
let weatherStatsPanelText;

// Configurable variables from the preferences menu.
let showHumidity, showWeatherStats, refreshSeconds, doRefresh;
let tempEntityID, humidityEntityID;


const TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
	Secret.SchemaFlags.NONE,
	{
		"token_string": Secret.SchemaAttributeType.STRING,
	}
);

// POPUP MENU
const MyPopup = GObject.registerClass(
    class MyPopup extends PanelMenu.Button {

        _init (toggle_area) {

            super._init(0);

            let icon = new St.Icon({
                gicon : Gio.icon_new_for_string( Me.dir.get_path() + '/icons/hass-main.png' ),
                style_class : 'system-status-icon',
            });

            this.add_child(icon);

            let ent_id, switch_name;
            // I am using an array of objects because I want to get a full copy of the 
            // pmItem and the ent_id. If I don't do that then the pmItem will be connected 
            // only to the laste entry of 'togglable_ent_ids' which means that whichever entry
            // of the menu you press, you will always toggle the same button
            var pmItems = [];
            for (ent_id of togglable_ent_ids) {
                if (ent_id === "" || !ent_id.includes("."))
                    continue
                // Capitalize every word
                switch_name = ent_id.split(".")[1].split("_").
                                     map(word => word.charAt(0).toUpperCase() + word.slice(1)).
                                     join(" ");
                let pmItem = new PopupMenu.PopupMenuItem('Toggle:');
                pmItem.add_child(
                    new St.Label({
                        text : switch_name
                    })
                );
                this.menu.addMenuItem(pmItem);
                pmItems.push({item: pmItem, entity: ent_id});
            }
            for (let item of pmItems) {
                item.item.connect('activate', () => {
                    _toggleEntity(item.entity)
                });
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.connect('open-state-changed', (menu, open) => {
                if (open) {
                    log('opened');
                } else {
                    log('closed');
                }
            });

            // sub menu
            let subItem = new PopupMenu.PopupSubMenuMenuItem('HASS Events');
            this.menu.addMenuItem(subItem);
            let start_hass_item = new PopupMenu.PopupMenuItem('Start Home Assistant');
            let stop_hass_item = new PopupMenu.PopupMenuItem('Stop Home Assistant');
            let close_hass_item = new PopupMenu.PopupMenuItem('Close Home Assistant');
            subItem.menu.addMenuItem(start_hass_item, 0);
            subItem.menu.addMenuItem(stop_hass_item, 1);
            subItem.menu.addMenuItem(close_hass_item, 2);
            start_hass_item.connect('activate', _startHass);
            stop_hass_item.connect('activate', _stopHass);
            close_hass_item.connect('activate', _closeHass);

            // // section
            // let popupMenuSection = new PopupMenu.PopupMenuSection();
            // popupMenuSection.actor.add_child(new PopupMenu.PopupMenuItem('section'));
            // this.menu.addMenuItem(popupMenuSection);

            // image item
            let popupImageMenuItem = new PopupMenu.PopupImageMenuItem(
                "Preferences",
                'security-high-symbolic',
            );
            popupImageMenuItem.connect('activate', () => {
                log("Opening Preferences...");
                ExtensionUtils.openPrefs();
            });
            this.menu.addMenuItem(popupImageMenuItem);

            // you can close, open and toggle the menu with
            // this.menu.close();
            // this.menu.open();
            // this.menu.toggle();
        }
    }
);

/* =======================================================
   ===================== HASS API ========================
   =======================================================
*/

function _toggleEntity(entity_id) {
    let data = `{"entity_id": "${entity_id}"}`;
    let result = send_request(`${base_url}api/services/switch/toggle`, 'POST', data);
    if (!result) {
        return false;
    }
    return true;    
}

function _startHass() {
    let result = send_request(`${base_url}api/events/homeassistant_start`, 'POST');
    if (!result) {
        return false;
    }
    return true;
}

function _stopHass() {
    let result = send_request(`${base_url}api/events/homeassistant_stop`, 'POST');
    if (!result) {
        return false;
    }
    return true;
}

function _closeHass() {
    let result = send_request(`${base_url}api/events/homeassistant_close`, 'POST');
    if (!result) {
        return false;
    }
    return true;
}

/* =======================================================
   ===================== WEATHER =========================
   =======================================================
*/
// TODO: The humidity is not so important and so there should be an option at prefs.js in order to remove it.
function _refreshWeatherStats() {
    try {
        if (showWeatherStats === true) {
            let out = "";
            // if showWeatherStats is true then the temperature must be shown (the humidity can be turned off)
            temperature = getWeatherSensorData(tempEntityID);
            out += temperature;
            if (showHumidity === true) {
                humidity = getWeatherSensorData(humidityEntityID);
                out += ` | ${humidity}`;
            }
            weatherStatsPanelText.text = out;
        }
    } catch (error) {
        log(error);
        disable();
        // will execute this function only once and abort. Remove in order to make the Main loop work
        return false;
    }
    // By returning true, the function will continue refresing every X seconds
    return true; 
}

function getWeatherSensorData(entity_id=null) {
    let json_result = send_request(`${base_url}api/states/${entity_id}`);
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
function send_request(url, type='GET', data=null) {
    let message = Soup.Message.new(type, url);
    message.request_headers.append(
        'Authorization',
        `Bearer ${Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null)}`
    )
    if (data !== null){
        // Set body data: Should be in json format, e.g. '{"entity_id": "switch.some_relay"}'
        // TODO: Maybe perform a check here
        message.set_request('application/json', 2, data);
    }
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
    // // Check if compiled schema exists and if not try to compile it
    // try {
    //     GLib.file_get_contents(`${Me.dir.get_path()}/schemas/gschemas.compiled`)
    // } catch (e) {
    //     Util.spawnCommandLine(`/usr/bin/glib-compile-schemas ${Me.dir.get_path()}/schemas/`);
    // }
}

function enable () {
    /* =======================================================
       ================== POPUP MENU AREA ====================
       =======================================================
    */
    
    try {
        let settings = Utils.getSettings('hass-data');
        // Can also use settings.set_string('...', '...');
        base_url = settings.get_string('hass-url');
        // access_token = settings.get_string('hass-access-token');
        togglable_ent_ids = settings.get_strv("hass-togglable-entities");
        showWeatherStats = settings.get_boolean('show-weather-stats');
        showHumidity = settings.get_boolean('show-humidity');
        tempEntityID = settings.get_string("temp-entity-id");
        humidityEntityID = settings.get_string("humidity-entity-id");
        refreshSeconds = Number(settings.get_string('weather-refresh-seconds'));
        doRefresh = settings.get_boolean("refresh-weather");
        // if (access_token === "") {
        //     access_token = Secret.password_lookup_sync(TOKEN_SCHEMA, {"token_string": "user_token"}, null);
        // }
    } catch (e) {
        log("Error:  Occurred while getting schema keys...")
        log("\tMake sure you have the following keys: 'hass-url', 'hass-access-token', 'hass-togglable-entities'.")
        log("\tCheck the org.gnome.shell.extensions.examle.gschema.xml file under the 'schemas' directory for an example.")
        throw e;
    }

    // Popup menu
    myPopup = new MyPopup("Kitchen Lights");
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
        myPopup.menu.toggle();
        log('shortcut is working');
    });
    if (showWeatherStats === true) {

        /**
         * ===== Weather Area ======
         */
        // Add the temperature in the panel
        weatherStatsPanel = new St.Bin({
            style_class : "panel-button",
            reactive : true,
            can_focus : true,
            track_hover : true,
            height : 30,
        });
        weatherStatsPanelText = new St.Label({
            text : "-°C",
            y_align: Clutter.ActorAlign.CENTER,
        });
        _refreshWeatherStats();
        weatherStatsPanel.set_child(weatherStatsPanelText);
        weatherStatsPanel.connect("button-press-event", () => {
            _refreshWeatherStats();
        });

        if (doRefresh === true) {
            // Update weather stats every X seconds
            refreshTimeout = Mainloop.timeout_add_seconds(refreshSeconds,  _refreshWeatherStats);
        }

        Main.panel._rightBox.insert_child_at_index(weatherStatsPanel, 1);
    }
}

function disable () {
    myPopup.destroy();

    // Disable shortcut
    Main.wm.removeKeybinding("hass-shortcut");

    if (showWeatherStats === true) {
        Main.panel._rightBox.remove_child(weatherStatsPanel);
        if (doRefresh === true) {
            Mainloop.source_remove(refreshTimeout);
        }
    }
}

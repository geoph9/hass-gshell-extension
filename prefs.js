const {Gio, Gtk, GObject, Secret} = imports.gi;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Settings = Me.imports.settings;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

// const Convenience = Me.imports.utils;
// const Convenience = imports.misc.extensionUtils;

const HASS_ACCESS_TOKEN = 'hass-access-token';
const HASS_URL = 'hass-url';
const HASS_TOGGLABLE_ENTITIES = 'hass-togglable-entities';
const HASS_ENABLED_ENTITIES = 'hass-enabled-entities';
// const HASS_SHORTCUT = 'hass-shortcut';
const SHOW_NOTIFICATIONS_KEY = 'show-notifications';
const SHOW_WEATHER_STATS = 'show-weather-stats';
const SHOW_HUMIDITY = 'show-humidity';
const TEMPERATURE_ID = 'temp-entity-id';
const HUMIDITY_ID = 'humidity-entity-id';
const DO_REFRESH = 'refresh-weather';
const REFRESH_RATE = 'weather-refresh-seconds';

function init() {
    // schema = _settings.settings_schema;
    ExtensionUtils.initTranslations();
    log(`initializing ${Me.metadata.name} Preferences`);
}

function buildPrefsWidget() {
    const prefsWidget = new Gtk.Grid();
    let notebook = new Gtk.Notebook({
        tab_pos: Gtk.PositionType.TOP,
        hexpand: true
    });

    prefsWidget.attach(notebook, 0, 0, 1, 1);

    let general_settings = new Gtk.Label({ label: _('General Settings'), halign: Gtk.Align.START});
    notebook.append_page(_buildGeneralSettings(), general_settings);

    let togglables = new Gtk.Label({ label: _('Togglables'), halign: Gtk.Align.START});
    // TODO
    // notebook.append_page(_buildTogglables(), togglables);
    notebook.append_page(_buildTogglableSettings(), togglables);

    let panelSensors = new Gtk.Label({ label: _('Panel Sensors'), halign: Gtk.Align.START});
    notebook.append_page(_buildSensorSettings(), panelSensors);

    return prefsWidget;
}

function _buildGeneralSettings() {
    const mscOptions = new Settings.MscOptions();
    let _settings = ExtensionUtils.getSettings();
    // _settings.connect('changed', _refresh.bind(this)); // TODO: Refresh
    let schema = _settings.settings_schema;

    let miscUI = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing:       10,
        homogeneous: false,
        margin_start:  12,
        margin_end:    12,
        margin_top:    12,
        margin_bottom: 12
    });

    let optionsList = [];

    // //////////////////////////////////////////////////////////
    // ////////////// Starting the Global Options ///////////////
    // //////////////////////////////////////////////////////////
    optionsList.push(
        _optionsItem(
            _makeTitle(_('Global options:')),
            null,
            null,
            null
        )
    );
    // Add the HASS url option
    let [urlItem, urlTextEntry, urlAddButton] = _makeGtkEntryButton(HASS_URL, false, schema=schema)
    optionsList.push(urlItem);
    // Add the HASS Access Token option
    let [tokItem, tokenTextEntry, tokenAddButton] = _makeGtkEntryButton(HASS_ACCESS_TOKEN, true, schema)
    optionsList.push(tokItem);

    // //////////////////////////////////////////////////////////
    // //////// Starting the Temperature/Humidity options ///////
    // //////////////////////////////////////////////////////////
    optionsList.push(
        _optionsItem(
            _makeTitle(_('Temperature/Humidity options:')),
            null,
            null,
            null
        )
    );
    // Show Temperature/Humidity Switch
    let [tempItem, tempHumiSwitch] = _makeSwitch(SHOW_WEATHER_STATS, schema)
    optionsList.push(tempItem);
    // Show Humidity Switch
    let [humiItem, humiSwitch] = _makeSwitch(SHOW_HUMIDITY, schema)
    optionsList.push(humiItem);
    // Refresh Temperature/Humidity Switch (TODO: Does not work currently)
    let [doRefItem, doRefreshSwitch] = _makeSwitch(DO_REFRESH, schema)
    optionsList.push(doRefItem);
    // Refresh rate for Temperature/Humidity (TODO: Does not work currently)
    let [refRateItem, refreshRateTextEntry, refreshRateAddButton] = _makeGtkEntryButton(REFRESH_RATE, false, schema)
    optionsList.push(refRateItem);
    // Add the temperature id option
    let [tempTextItem, tempTextEntry, tempAddButton] = _makeGtkEntryButton(TEMPERATURE_ID, false, schema)
    optionsList.push(tempTextItem);
    // Add the humidity id option
    let [humiTextItem, humiTextEntry, humiAddButton] = _makeGtkEntryButton(HUMIDITY_ID, false, schema)
    optionsList.push(humiTextItem);

    // //////////////////////////////////////////////////////////
    // //////////// Default Icon Handler/Configuration //////////
    // //////////////////////////////////////////////////////////
    optionsList.push(_optionsItem(
        _makeTitle(_('Panel Icon Options:')),
        null,
        null,
        null
    ));
    let validIcons = mscOptions.validIcons;
    let currentIcon = mscOptions.panelIcon;
    let superGroup = new Gtk.CheckButton();  // to convert to radio buttons.
    let iconCheckBoxes = [];
    for (let ic of validIcons) {
        let checked = false;
        if (ic === currentIcon) checked = true;
        let label = ic.split("/")[ic.split("/").length-1]
                      .split(".")[0]
                      .split("-")
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(" ");
        let [iconItem, panelIconCheckBox] = _makeCheckBox(_("%s Icon").format(label), checked, superGroup);
        optionsList.push(iconItem);
        iconCheckBoxes.push({
            icon: ic,
            rb: panelIconCheckBox
        });
    }
    optionsList.push(_optionsItem(
        _("You will need to restart your session in order for this change to take effect."),
        _("On Xorg, you can do that by Alt+F2 and then pressing 'r' and Enter. If this doesn't work (Wayland), you have to logout and re-login."),
        new Gtk.Label(),
        null
    ));


    // //////////////////////////////////////////////////////////
    // ////////////////// Building the boxes ////////////////////
    // //////////////////////////////////////////////////////////
    let frame;
    let frameBox;
    let canFocus;
    for (let item of optionsList) {
        if (item[0].length === 1) {
            let lbl = new Gtk.Label();
            lbl.set_markup(item[0][0]);
            frame = new Gtk.Frame({
                label_widget: lbl
            });
            frameBox = new Gtk.ListBox({
                selection_mode: null,
                can_focus: true,
            });
            miscUI.append(frame);
            frame.set_child(frameBox);
            continue;
        }
        canFocus = !item[0][2] ? false : true;
        let box = new Gtk.Box({
            can_focus: canFocus,
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_start: 4,
            margin_end:   4,
            margin_top:   4,
            margin_bottom:4,
            hexpand: true,
            spacing: 30,
        });
        for (let i of item[0]) {
            box.append(i)
        }
        if (item.length === 2) {
            box.set_tooltip_text(item[1]);
        }
        frameBox.append(box);
    }

    // //////////////////////////////////////////////////////////
    // //////////////// Handlers for Switches ///////////////////
    // //////////////////////////////////////////////////////////
    tempHumiSwitch.active = mscOptions.tempHumi;
    tempHumiSwitch.connect('notify::active', () => {
        mscOptions.tempHumi = tempHumiSwitch.active;
    });
    humiSwitch.active = mscOptions.showHumidity;
    humiSwitch.connect('notify::active', () => {
        mscOptions.showHumidity = humiSwitch.active;
    });
    doRefreshSwitch.active = mscOptions.doRefresh;
    doRefreshSwitch.connect('notify::active', () => {
        mscOptions.doRefresh = doRefreshSwitch.active;
    });

    // //////////////////////////////////////////////////////////
    // /////////////// Handlers for the Buttons /////////////////
    // //////////////////////////////////////////////////////////
    // urlAddButton.clicked = mscOptions.hassUrl;
    urlTextEntry.set_text(mscOptions.hassUrl);
    urlAddButton.connect('clicked', () => {
        mscOptions.hassUrl = urlTextEntry.get_text();
    });

    refreshRateTextEntry.set_text(mscOptions.refreshRate);
    refreshRateAddButton.connect('clicked', () => {
        mscOptions.refreshRate = refreshRateTextEntry.get_text();
    });

    tempTextEntry.set_text(mscOptions.temperatureId);
    tempAddButton.connect('clicked', () => {
        mscOptions.temperatureId = tempTextEntry.get_text();
    });

    humiTextEntry.set_text(mscOptions.humidityId);
    humiAddButton.connect('clicked', () => {
        mscOptions.humidityId = humiTextEntry.get_text();
    });

    // //////////////////////////////////////////////////////////
    // ////////////// Handlers for Radio Buttons ////////////////
    // //////////////////////////////////////////////////////////
    for (let icCheckbox of iconCheckBoxes) {
        icCheckbox.rb.connect('notify::active', () => {
            // log("New radio button will be:" + icCheckbox.icon);
            mscOptions.panelIcon = icCheckbox.icon;
        });
    }

    return miscUI;
}

function _buildTogglableSettings() {
    const mscOptions = new Settings.MscOptions();

    const scrollWindow = new Gtk.ScrolledWindow();
    let miscUI = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing:       10,
        homogeneous: false,
        margin_start:  12,
        margin_end:    12,
        margin_top:    12,
        margin_bottom: 12,
        hexpand: true,
        vexpand: true,
    });
    let searchEntry = new Gtk.SearchEntry({
        halign: Gtk.Align.START,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
    if (typeof searchEntry.set_search_delay === "function") {
        searchEntry.set_search_delay(150);
    }
    miscUI.append(searchEntry);

    let optionsList = [];

    // //////////////////////////////////////////////////////////
    // /////////// Which switches should be togglable ///////////
    // //////////////////////////////////////////////////////////
    let togglables = mscOptions.togglableEntities;
    let enabledEntities = mscOptions.enabledEntities;
    if (togglables.length === 0) {
        optionsList.push(_optionsItem(
            _makeTitle(_('Togglable Entities:')), null, null, null
        ));
    } else {
        // Only the title changes
        optionsList.push(_optionsItem(
            _makeTitle(_('Choose Togglable Entities:')), null, null, null
        ));
    }

    // Add the togglable check boxes option
    let togglableCheckBoxes = [];
    for (let tog of togglables) {
        let checked = false;
        if (enabledEntities.includes(tog.entity_id)) checked = true;
        let [togglableItem, togglableCheckBox] = _makeCheckBox(
            "%s (%s)".format(tog.name, tog.entity_id),
            checked
        );
        optionsList.push(togglableItem);
        togglableCheckBoxes.push({
            entity: tog,
            cb: togglableCheckBox,
            checked: checked
        });
    }

    // //////////////////////////////////////////////////////////
    // ////////////////// Building the boxes ////////////////////
    // //////////////////////////////////////////////////////////
    let frame;
    let frameBox;
    for (let item_id in optionsList) {
        let item = optionsList[item_id];
        if (item[0].length === 1) {
            let lbl = new Gtk.Label();
            lbl.set_markup(item[0][0]);
            frame = new Gtk.Frame({
                label_widget: lbl
            });
            frameBox = new Gtk.ListBox({
                selection_mode: null,
                can_focus: false,
            });
            miscUI.append(frame);
            frame.set_child(frameBox);
            continue;
        }
        let box = new Gtk.Box({
            can_focus: false,
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_start: 4,
            margin_end:   4,
            margin_top:   4,
            margin_bottom:4,
            hexpand: true,
            spacing: 30,
        });
        for (let i of item[0]) {
            box.append(i)
        }
        if (item.length === 2) {
            box.set_tooltip_text(item[1]);
        }
        frameBox.append(box);
    }

    searchEntry.connect('search-changed', () => {
        let pattern = searchEntry.get_text().toLowerCase();
        frameBox.set_filter_func(function(row) {
            let label = row.child.get_last_child().get_text();
            return label ? label.toLowerCase().includes(pattern) : true;
        });
    });

    // //////////////////////////////////////////////////////////
    // /////////////// Handlers for Checkboxes //////////////////
    // //////////////////////////////////////////////////////////
    for (let togCheckBox of togglableCheckBoxes) {
        togCheckBox.cb.set_active(togCheckBox.checked)
        togCheckBox.cb.connect('notify::active', () => {
            let currentEntities = mscOptions.enabledEntities;
            let index = currentEntities.indexOf(togCheckBox.entity);
            if (index > -1) { // then it exists and so we pop
                currentEntities.splice(index, 1)
            } else {
                currentEntities.push(togCheckBox.entity)
            }
            mscOptions.enabledEntities = mscOptions.togglableEntities.map(
                ent => ent.entity_id
            ).filter(
                ent => currentEntities.includes(ent)
            );
        });
    }

    scrollWindow.set_child(miscUI)

    return scrollWindow;
}

function _buildSensorSettings() {
    const mscOptions = new Settings.MscOptions();

    const scrollWindow = new Gtk.ScrolledWindow();
    let miscUI = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing:       10,
        homogeneous: false,
        margin_start:  12,
        margin_end:    12,
        margin_top:    12,
        margin_bottom: 12,
        hexpand: true,
        vexpand: true,
    });
    let searchEntry = new Gtk.SearchEntry({
        halign: Gtk.Align.START,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
    searchEntry.set_search_delay(200);
    miscUI.append(searchEntry);

    let optionsList = [];

    // //////////////////////////////////////////////////////////
    // ////// Which sensors should be shown on the panel ////////
    // //////////////////////////////////////////////////////////
    let allSensors = mscOptions.hassSensorEntities;
    let enabledSensors = mscOptions.enabledSensors;
    if (allSensors.length === 0) {
        optionsList.push(_optionsItem(
            _makeTitle(_('Sensors:')), null, null, null
        ));
    } else {
        // Only the title changes
        optionsList.push(_optionsItem(
            _makeTitle(_('Choose Which Sensors Should Appear on the Panel:')), null, null, null
        ));
    }

    // Add the togglable check boxes option
    let sensorCheckBoxes = [];
    for (let sensor of allSensors) {
        let checked = false;
        if (enabledSensors.includes(sensor.entity_id)) checked = true;
        let [sensorItem, sensorCheckBox] = _makeCheckBox(
            "%s (%s)".format(sensor.name, sensor.entity_id),
            checked
        );
        optionsList.push(sensorItem);
        sensorCheckBoxes.push({
            entity: sensor,
            cb: sensorCheckBox,
            checked: checked
        });
    }



    // //////////////////////////////////////////////////////////
    // ////////////////// Building the boxes ////////////////////
    // //////////////////////////////////////////////////////////
    let frame;
    let frameBox;
    for (let item_id in optionsList) {
        let item = optionsList[item_id];
        if (item[0].length === 1) {
            let lbl = new Gtk.Label();
            lbl.set_markup(item[0][0]);
            frame = new Gtk.Frame({
                label_widget: lbl
            });
            frameBox = new Gtk.ListBox({
                selection_mode: null,
                can_focus: false,
            });
            miscUI.append(frame);
            frame.set_child(frameBox);
            continue;
        }
        let box = new Gtk.Box({
            can_focus: false,
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_start: 4,
            margin_end:   4,
            margin_top:   4,
            margin_bottom:4,
            hexpand: true,
            spacing: 30,
        });
        for (let i of item[0]) {
            box.append(i)
        }
        if (item.length === 2) {
            box.set_tooltip_text(item[1]);
        }
        frameBox.append(box);
    }

    searchEntry.connect('search-changed', () => {
        let pattern = searchEntry.get_text().toLowerCase();
        frameBox.set_filter_func(function(row) {
            let label = row.child.get_last_child().get_text();
            return label ? label.toLowerCase().includes(pattern) : true;
        });
    });

    // //////////////////////////////////////////////////////////
    // /////////////// Handlers for Checkboxes //////////////////
    // //////////////////////////////////////////////////////////
    for (let sensorCheckBox of sensorCheckBoxes) {
        sensorCheckBox.cb.set_active(sensorCheckBox.checked)
        sensorCheckBox.cb.connect('notify::active', () => {
            let currentSensors = mscOptions.enabledSensors;
            let index = currentSensors.indexOf(sensorCheckBox.entity);
            if (index > -1) { // then it exists and so we pop
                currentSensors.splice(index, 1)
            } else {
                currentSensors.push(sensorCheckBox.entity)
            }
            mscOptions.enabledSensors = mscOptions.hassSensorEntities.map(
                ent => ent.entity_id
            ).filter(
                ent => currentSensors.includes(ent)
            );
        });
    }

    scrollWindow.set_child(miscUI)

    return scrollWindow;
}

function _optionsItem(text, tooltip, widget, button) {
    let item = [[],];
    let label;
    if (widget) {
        label = new Gtk.Label({
            halign: Gtk.Align.START
        });
        label.set_markup(text);
    } else {
        label = text;
    }
    item[0].push(label);
    if (widget)
        item[0].push(widget);
    if (tooltip)
        item.push(tooltip);
    if (button)
        item[0].push(button)

    return item;
}

function _makeTitle(label) {
    return '<b>'+label+'</b>';
}

function _makeGtkEntryButton(name, isAccessToken, schema) {
    let key = schema.get_key(name);
    let [textEntry, addButton] = _newGtkEntryButton();
    if (isAccessToken === true) {
        addButton.connect('clicked', () => {
            if (textEntry.get_text().trim() !== "") {
                // Synchronously (the UI will block): https://developer.gnome.org/libsecret/unstable/js-store-example.html
                Secret.password_store_sync(
                    Utils.getTokenSchema(),
                    {"token_string": "user_token"},
                    Secret.COLLECTION_DEFAULT,
                    "long_live_access_token",
                    textEntry.get_text(),
                    null
                );
                textEntry.set_text("Success!");
            } else {
                textEntry.set_text("Invalid Token!");
            }
        });
    }
    // else {
    //     addButton.connect('clicked', () => {
    //         _settings.set_string(name, textEntry.get_text())
    //     });
    // }
    return [
        _optionsItem(
            _(key.get_summary()),
            _(key.get_description()),
            textEntry,
            addButton
        ),
        textEntry,
        addButton
    ]
}

function _makeSwitch(name, schema) {
    let key = schema.get_key(name);
    let gtkSwitch = _newGtkSwitch();
    return [
        _optionsItem(
            _(key.get_summary()),
            _(key.get_description()),
            gtkSwitch,
            null
        ),
        gtkSwitch
    ]
}

/**
 *
 * @param {String} name The name of the text on the left of the check box.
 * @param {boolean} checked (Optional) Whether the box is checked or not. Defaults to false.
 * @param {Gtk.CheckButton} buttonGroup (Optional) A check button group which the new checkbutton will belong to.
 * If provided then the checkbutton will be a radio button.
 * @return {Gtk.CheckButton} A new Gtk.CheckButton instance.
 */
function _makeCheckBox(name, checked, buttonGroup) {
    let gtkCheckBox = _newGtkCheckBox(checked, buttonGroup);
    let desc;
    if (buttonGroup !== undefined) {
        desc = _("Do you want to have the '%s' icon in your panel?").format(name);
    } else {
        desc = _("Do you want to show %s in the tray menu?").format(name)
    }

    let label = new Gtk.Label({
        halign: Gtk.Align.START,
        hexpand: true
    });
    label.set_text(name);

    let item = [[gtkCheckBox, label], desc];
    return [item, gtkCheckBox];
}

function _newGtkCheckBox(checked, buttonGroup) {
    let cb = new Gtk.CheckButton({
        halign: Gtk.Align.START,
        valign: Gtk.Align.CENTER
    });
    if (checked === true) {
        cb.set_active(true)
    }
    if (buttonGroup !== undefined) {
        cb.set_group(buttonGroup);
    }
    return cb
}

function _newGtkSwitch() {
    return new Gtk.Switch({
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
}

function _newGtkEntryButton() {
    let textEntry = new Gtk.Entry({
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true,
        text: ""
    });

    let addButton = new Gtk.Button({
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        label: _("Add"),
        hexpand: true
    });
    return [textEntry, addButton]
}

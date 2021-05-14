/*jshint multistr:true */
/*jshint esnext:true */
/*global imports: true */
/*global global: true */
/*global log: true */

const {Gio, Gtk, GObject, Secret} = imports.gi;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

// const Convenience = Me.imports.utils;
const Convenience = imports.misc.extensionUtils;

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
const HASS_SETTINGS = 'org.gnome.shell.extensions.hass-data';


// const TOKEN_SCHEMA = Secret.Schema.new("org.gnome.hass-data.Password",
// 	Secret.SchemaFlags.NONE,
// 	{
// 		"token_string": Secret.SchemaAttributeType.STRING,
// 	}
// );

// let ShellVersion = parseInt(Config.PACKAGE_VERSION.split(".")[1]);

// Taken from the Caffeine extension:
//  https://github.com/eonpatapon/gnome-shell-extension-caffeine/blob/master/caffeine%40patapon.info/prefs.js
class HassWidget {
    constructor(params) {
        this.w = new Gtk.Grid(params);
        this.w.set_orientation(Gtk.Orientation.VERTICAL);

        this._settings = Convenience.getSettings(HASS_SETTINGS);
        this._settings.connect('changed', this._refresh.bind(this));
        this._changedPermitted = false;

        // attach or .insert_row
        this.w.attach(this.make_row_switch(SHOW_WEATHER_STATS), 0, 0, 1, 1);
        this.w.attach(this.make_row_switch(SHOW_HUMIDITY), 0, 1, 1, 1);
        this.w.attach(this.make_row_switch(DO_REFRESH), 0, 2, 1, 1);
        this.w.attach(this.make_text_row(REFRESH_RATE, true), 0, 3, 1, 1);

        /*  =========================================
            ======== HASS PROFILE SPECIFICS =========
            =========================================
        */

        this.w.attach(this.make_text_row(TEMPERATURE_ID), 0, 4, 2, 1);
        this.w.attach(this.make_text_row(HUMIDITY_ID), 0, 5, 2, 1);

        // this.w.attach(this.make_text_row(HASS_ACCESS_TOKEN));
        this.w.attach(this.make_hass_token_row_keyring(), 0, 6, 2, 1);
        this.w.attach(this.make_text_row(HASS_URL), 0, 7, 2, 1);


        /*  =========================================
            ======= ENABLE NOTIFICATION AREA ========
            =========================================
        */

        // const notificationsBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
        //                         spacing: 7});

        // const notificationsLabel = new Gtk.Label({label: "Enable notifications",
        //                            xalign: 0});

        // const notificationsSwitch = new Gtk.Switch({active: this._settings.get_boolean(SHOW_WEATHER_STATS)});
        // notificationsSwitch.connect('notify::active', button => {
        //     this._settings.set_boolean(SHOW_WEATHER_STATS, button.active);
        // });

        // notificationsBox.pack_start(notificationsLabel, true, true, 0);
        // notificationsBox.add(notificationsSwitch);

        // this.w.attach(notificationsBox);

        /*  ============================================
            ========= ADD NEW ENTITY IDS AREA ==========
            ============================================
        */

        this._store = new Gtk.ListStore();
        this._store.set_column_types([GObject.TYPE_STRING]);


        let addNewEntityBox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL});

        let addNewEntityLabel = new Gtk.Label({label: "New Entity ID:", xalign: 0});

        let addNewEntityEntry = new Gtk.Entry();
        let addNewEntityButton = new Gtk.Button({ label: "Add Entity ID"});
        addNewEntityButton.connect('clicked', () => {
          this._createNew(addNewEntityEntry.get_text())
        });

        addNewEntityBox.prepend(addNewEntityLabel);
        addNewEntityBox.append(addNewEntityEntry);
        addNewEntityBox.append(addNewEntityButton);

        this.w.attach(addNewEntityBox, 0, 8, 1, 1);

        //

        this._treeView = new Gtk.TreeView({ model: this._store,
                                            hexpand: true, vexpand: true });
        this._treeView.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        const entityColumn = new Gtk.TreeViewColumn({ expand: true, sort_column_id: 0,
                                                title: "Home Assistant Entity Ids that can be toggled:" });
        const idRenderer = new Gtk.CellRendererText;
        // entityColumn.prepend(idRenderer);
        // entityColumn.add_attribute(idRenderer, "text", 0);
        entityColumn.pack_start(idRenderer, true);
        entityColumn.add_attribute(idRenderer, "text", 0);
        this._treeView.append_column(entityColumn);

        this.w.attach(this._treeView, 0, 9, 1, 1);

        const toolbar = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 0});
        const delButton = new Gtk.Button({ icon_name : 'list-remove-symbolic' });
        delButton.connect('clicked', this._deleteSelected.bind(this));
        // toolbar.add(delButton);
        toolbar.append(delButton);
        this.w.attach(toolbar, 0, 10, 1, 1);

        this._changedPermitted = true;
        this._refresh();
    }

    scan() {
        let base_url = this._settings.get_string(HASS_URL);
        let newTogglableEntities = Utils.discoverSwitches(base_url);
    }


    // Taken from the GameMode gnome-shell-extension: https://extensions.gnome.org/extension/1852/gamemode/
    make_row_switch(name) {
        let schema = this._settings.settings_schema;

        let row = new Gtk.ListBoxRow();

        let hbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 7,
        });

        // row.set('1', hbox);  // row.add(hbox);
        row.set_child(hbox);
        let vbox, sw;

        try {
          sw = new Gtk.Switch({valign: Gtk.Align.CENTER});
          hbox.prepend(sw);
        } catch(e) {
          log("Error while adding switch...");
          throw e;
        }

        try {
          vbox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 7});
          hbox.prepend(vbox);
        } catch(e) {
          log("Error while adding vbox...");
          throw e;
        }

        try {
          let key = schema.get_key(name);

          let description = new Gtk.Label({
              label: `<span size='small'>${key.get_description()}</span>`,
              hexpand: true,
              halign: Gtk.Align.START,
              use_markup: true
          });
          description.get_style_context().add_class('dim-label');

          vbox.prepend(description);

          let summary = new Gtk.Label({
              label: `<span size='medium'><b>${key.get_summary()}</b></span>`,
              hexpand: true,
              halign: Gtk.Align.START,
              use_markup: true
          });

          vbox.prepend(summary);

          this._settings.bind(name, sw, 'active',
                              Gio.SettingsBindFlags.DEFAULT);
        } catch(e) {
          logError(e, "Error adding description and summary...");
        }
        return row;
    }

    make_text_row(name, sameRowText=false) {
      let schema = this._settings.settings_schema;

      let row = new Gtk.ListBoxRow();
      let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 7});
      // or row.set_child(hbox)
      // row.set('1',hbox);
      row.set_child(hbox);
      let vbox;
      try {
        vbox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 7});
        
        let addButton = new Gtk.Button({valign: Gtk.Align.CENTER, label: "Add"});
        addButton.connect('clicked', () => {
          this._settings.set_string(name, textEntry.get_text())
        });

        let key = schema.get_key(name);
        let summary = new Gtk.Label({label: `<span size='medium'><b>${key.get_summary()}</b></span>`, hexpand: true, 
                                    halign: Gtk.Align.START, use_markup: true})
        let description = new Gtk.Label({
            label: `<span size='small'>${key.get_description()}</span>`,
            hexpand: true,
            halign: Gtk.Align.START,
            use_markup: true
        });
        description.get_style_context().add_class('dim-label');

        let default_val = this._settings.get_string(name);
        // if (default_val === "") {
        //   default_val = key.get_default_value().get_string()[0];
        // }

        let textEntry = new Gtk.Entry({text: default_val});
        if (sameRowText){
          hbox.prepend(addButton);
          hbox.prepend(textEntry);
        } else {
          vbox.prepend(textEntry);
          hbox.prepend(addButton);
        }
        vbox.prepend(description);
        vbox.prepend(summary);
        hbox.prepend(vbox);
      } catch (e) {
        logError(e, "Error trying to add button...");
      }

      return row;

    }

    make_hass_token_row_keyring(){
      try {
        let schema = this._settings.settings_schema;

        let row = new Gtk.ListBoxRow();
        let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 7});
        // row.set('1',hbox);
        row.set_child(hbox);
        let vbox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});


        let addButton = new Gtk.Button({valign: Gtk.Align.CENTER, label: "Add"});
        addButton.connect('clicked', () => {
          // Synchronously (the UI will block): https://developer.gnome.org/libsecret/unstable/js-store-example.html
          Secret.password_store_sync(Utils.TOKEN_SCHEMA, {"token_string": "user_token"}, Secret.COLLECTION_DEFAULT,
          "long_live_access_token", textEntry.get_text(), null);
        });

        let key = schema.get_key(HASS_ACCESS_TOKEN);
        let summary = new Gtk.Label({label: `<span size='medium'><b>${key.get_summary()}</b></span>`, hexpand: true, 
                                    halign: Gtk.Align.START, use_markup: true})
        let description = new Gtk.Label({
            label: `<span size='small'>${key.get_description()}</span>`,
            hexpand: true,
            halign: Gtk.Align.START,
            use_markup: true
        });
        description.get_style_context().add_class('dim-label');

        let textEntry = new Gtk.Entry({text: ""});

        vbox.prepend(textEntry);
        hbox.prepend(addButton);
        vbox.prepend(description);
        vbox.prepend(summary);
        hbox.prepend(vbox);
        return row;
      } catch (e) {
        logError(e, "Error creating hass token entry...");
      }

    }

    _createNew(entity_id) {

      this._changedPermitted = false;
      if (!this._appendItem(entity_id)) {
          this._changedPermitted = true;
          return;
      }
      let iter = this._store.append();

      this._store.set(iter,
                      [0],
                      [entity_id]);
      this._changedPermitted = true;
    }

    _deleteSelected() {
        const [any, , iter] = this._treeView.get_selection().get_selected();

        if (any) {
            const entityInfo = this._store.get_value(iter, 0);
            this._changedPermitted = false;
            this._removeItem(entityInfo);
            this._store.remove(iter);
            this._changedPermitted = true;
        }
    }

    _refresh() {
        if (!this._changedPermitted)
            // Ignore this notification, model is being modified outside
            return;

        this._store.clear();

        const currentItems = this._settings.get_strv(HASS_TOGGLABLE_ENTITIES);
        const validItems = [ ];
        for (let i = 0; i < currentItems.length; i++) {
            let item = currentItems[i];
            if (item === "")
              continue
            if (!item.includes(".")){
              item += " (INVALID)"
            }
            validItems.push(item);
            const iter = this._store.append();
            this._store.set(iter,
                            [0],
                            [item]);
        }

        if (validItems.length != currentItems.length) // some items were filtered out
            this._settings.set_strv(HASS_TOGGLABLE_ENTITIES, validItems);
    }

    _appendItem(entity_id) {
        const currentItems = this._settings.get_strv(HASS_TOGGLABLE_ENTITIES);

        if (currentItems.includes(entity_id) || entity_id.replace(' ', '') === '') {
            printerr("Cannot append item: We either already have an item for this entity_id or the input was empty.");
            return false;
        }

        currentItems.push(entity_id);
        this._settings.set_strv(HASS_TOGGLABLE_ENTITIES, currentItems);
        return true;
    }

    _removeItem(entity_id) {
        if (entity_id.includes(" (INVALID)")) {
          entity_id = entity_id.replace(" (INVALID)", "")
        }
        const currentItems = this._settings.get_strv(HASS_TOGGLABLE_ENTITIES);
        const index = currentItems.indexOf(entity_id);

        if (index < 0)
            return;

        currentItems.splice(index, 1);
        this._settings.set_strv(HASS_TOGGLABLE_ENTITIES, currentItems);
    }
}


function init() {
  
}

function buildPrefsWidget() {
    const widget = new HassWidget();
    // widget.w.show_all();  // shown by default in gtk4

    return widget.w;
}

const getMethods = (obj) => {
    let properties = new Set()
    let currentObj = obj
    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    } while ((currentObj = Object.getPrototypeOf(currentObj)))
    return [...properties.keys()].filter(item => typeof obj[item] === 'function')
}

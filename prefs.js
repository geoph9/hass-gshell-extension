import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Secret from 'gi://Secret';

import * as Utils from './utils.js';
import * as Settings from './settings.js';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// const {Adw, Gio, Gtk, Secret} = imports.gi;
// const ExtensionUtils = imports.misc.extensionUtils;
// const Me = ExtensionUtils.getCurrentExtension();

// const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
// const _ = Gettext.gettext;

class SettingsPage {
    constructor(type, window, mscOptions) {
        if (type !== "togglable" && type !== "runnable" && type !== "sensor")
            throw new Error(`Type ${type} is not supported in SettingsPage`)

        this.type = type;
        this.window = window;
        this._mscOptions = mscOptions;
        this.page = null;
        this.group = null;
        this.rows = [];
    }

    get pageConfig() {
        let title;
        let iconName;
        switch (this.type) {
            case "togglable":
                title = _('Togglables');
                iconName = "system-shutdown-symbolic";
                break;
            case "runnable":
                title = _('Runnables');
                iconName = "system-shutdown-symbolic";
                break;
            case "sensor":
                title = _('Sensors');
                iconName = "weather-clear-symbolic";
                break;
        }
        return {
            title: title,
            iconName: iconName
        }
    }

    build() {
        this.page = new Adw.PreferencesPage({
            title: this.pageConfig.title,
            icon_name: this.pageConfig.iconName,
        });

        this.group = new Adw.PreferencesGroup({ title: _(`Choose which ${this.type}s should appear in the menu:`)});
        this.page.add(this.group);
        this.window.add(this.page);
        Utils.connectSettings([Settings.HASS_ENTITIES_CACHE], this.refresh.bind(this));
        this.refresh();
    }

    refresh(entries=null) {
        this.deleteRows();
        if (!entries) {
            Utils.getEntitiesByType(
                this.type,
                (results) => this.refresh(results),
                () => this.refresh([])
            );
            return;
        }

        if (!entries.length) {
            let row = SettingsPage.createTextRow(
                _(`No ${this.type} found. Please check your Home-Assistant connection settings.`)
            );
            this.rows.push(row);
            this.group.add(row);
            return;
        }

        let enabledEntities = this._mscOptions.getEnabledByType(this.type);
        for (let entry of entries) {
            let row = SettingsPage.createEntityRow(
                entry,
                enabledEntities.includes(entry.entity_id),
                (rowEntry, checked) => {
                  Utils._log(
                      "%s %s (%s) as panel entry",
                      [checked ? "Check" : "Uncheck", rowEntry.name, rowEntry.entity_id]
                  );
                  let currentEntities = this._mscOptions.getEnabledByType(this.type);
                  let index = currentEntities.indexOf(rowEntry.entity_id);
                  if (index > -1 && !checked) { // then it exists and so we pop
                      Utils._log(
                          "Entry %s (%s) currently present, remove it",
                          [rowEntry.name, rowEntry.entity_id]
                      );
                      currentEntities.splice(index, 1);
                  }
                  else if (index <= -1 && checked) {
                      Utils._log(
                          "Entry %s (%s) not currently present, add it",
                          [rowEntry.name, rowEntry.entity_id]
                      );
                      currentEntities.push(rowEntry.entity_id);
                  }
                  else {
                      Utils._log(
                          "Entry %s (%s) currently %s, no change",
                          [rowEntry.name, rowEntry.entity_id, checked ? "present" : "not present"]
                      );
                      return;
                  }
                  this._mscOptions.setEnabledByType(this.type, entries.map(
                      ent => ent.entity_id
                  ).filter(
                      ent => currentEntities.includes(ent)
                  ));
                  Utils._log(
                      "%s entries enabled: %s",
                      [this._mscOptions.getEnabledByType(this.type).length, this._mscOptions.getEnabledByType(this.type).join(', ')]
                  );
                }
            );
            this.rows.push(row);
            this.group.add(row);
        }
    }

    deleteRows() {
        // Remove previously created rows
        for (let row of this.rows)
            this.group.remove(row);
        this.rows = [];
    }

    static createEntityRow(entity, checked, on_toggle) {
        let row = new Adw.ActionRow({
            title: "%s (%s)".format(entity.name, entity.entity_id),
        });

        // Create a switch and bind its value to the `show-indicator` key
        let toggle = new Gtk.CheckButton({
            active: checked,
            valign: Gtk.Align.CENTER,
        });

        // Add the switch to the row
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        toggle.connect('notify::active', () => {
            on_toggle(entity, toggle.active);
        });

        return row;
    }

    static createTextRow(text) {
        return new Adw.ActionRow({
            title: text,
        });
    }
}

export default class HassPrefs extends ExtensionPreferences  {
    // constructor(window) {
    // }

    fillPreferencesWindow(window) {
        this.window = window;
        this._settings = this.getSettings();
        this.window._settings = this._settings;
        this._mscOptions = new Settings.MscOptions(
            this.metadata,
            this.dir
        );

        this.togglablesPage = new SettingsPage("togglable", this.window, this._mscOptions);
        this.runnablesPage = new SettingsPage("runnable", this.window, this._mscOptions);
        this.sensorsPage = new SettingsPage("sensor", this.window, this._mscOptions);
        Utils.init(
            this.metadata.uuid,
            this._settings,
            this.metadata,
            this.dir,
            _
        );
        this.build();
        this.window.connect('close-request', () => {
            Utils.disable();
        });
    }

    build() {
        this.buildGeneralSettingsPage();
        
        this.togglablesPage.build();
        this.runnablesPage.build();
        this.sensorsPage.build();

        // Enable search on settings
        this.window.search_enabled = true;
    }

    buildGeneralSettingsPage() {
        let page = new Adw.PreferencesPage({
            title: _('General Settings'),
            icon_name: "preferences-other-symbolic",
        });

        const general_group = new Adw.PreferencesGroup({ title: _('General Settings')});
        page.add(general_group);

        general_group.add(this.createStringSettingRow(Settings.HASS_URL));
        general_group.add(this.createAccessTokenSettingRow());
        general_group.add(this.createBooleanSettingRow(Settings.SHOW_NOTIFICATIONS_KEY));
        general_group.add(this.createBooleanSettingRow(Settings.DEBUG_MODE));

        const refresh_group = new Adw.PreferencesGroup({ title: _('Refresh sensors')});
        page.add(refresh_group);

        refresh_group.add(this.createBooleanSettingRow(Settings.DO_REFRESH));
        refresh_group.add(this.createStringSettingRow(Settings.REFRESH_RATE));

        const icon_group = new Adw.PreferencesGroup({ title: _('Panel Icon Options:')});
        page.add(icon_group);

        let validIcons = this._mscOptions.validIcons;
        let currentIcon = this._mscOptions.panelIcon;
        let iconGroup = new Gtk.CheckButton();
        for (let icon of validIcons) {
            icon_group.add(
              this.createIconRow(
                icon,
                icon == currentIcon,
                iconGroup,
                (icon) => {
                  this._mscOptions.panelIcon = icon;
                }
              )
            );
        }

        this.window.add(page);
    }

    createBooleanSettingRow(name) {
        let key = this._settings.settings_schema.get_key(name);
        let row = new Adw.ActionRow({
            title: _(key.get_summary()),
            subtitle: _(key.get_description()),
        });

        // Create a switch and bind its value to the `show-indicator` key
        let toggle = new Gtk.Switch({
            active: this._settings.get_boolean(name),
            valign: Gtk.Align.CENTER,
        });
        this._settings.bind(name, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

        // Add the switch to the row
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        return row;
    }

    createStringSettingRow(name) {
        let key = this._settings.settings_schema.get_key(name);
        let row = new Adw.EntryRow({
            title: _(key.get_summary()),
            text: this._settings.get_string(name),
            show_apply_button: true,
        });

        row.connect('apply', () => {
            this._settings.set_string(name, row.get_text())
        });

        return row;
    }

    createAccessTokenSettingRow() {
        let row = new Adw.PasswordEntryRow({
            title: _("Access Token"),
            show_apply_button: true,
        });

        row.connect('apply', () => {
          Utils._log('Access token changed: "%s"', [row.get_text()]);
          let new_value = row.get_text();
          if (!new_value) return;
          Secret.password_store(
              Utils.getTokenSchema(),
              {"token_string": "user_token"},
              Secret.COLLECTION_DEFAULT,
              "long_live_access_token",
              row.get_text(),
              null,
              (source, result) => {
                  Secret.password_store_finish(result);
                  // Always force reload entities cache in case of HASS Token change and invalidate it in case
                  // of error
                  Utils.getEntities(null, () => Utils.invalidateEntitiesCache(), true);
              }
          );
        });

        return row;
    }

    createIconRow(icon, checked,  icon_group, on_toggle) {
        let label = icon.split("/")[icon.split("/").length-1]
                    .split(".")[0]
                    .split("-")
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ");
        let row = new Adw.ActionRow({
            title: label,
        });

        // Create a switch and bind its value to the `show-indicator` key
        let toggle = new Gtk.CheckButton({
            active: checked,
            valign: Gtk.Align.CENTER,
            group: icon_group,
        });

        // Add the switch to the row
        row.add_suffix(toggle);
        row.activatable_widget = toggle;

        toggle.connect('notify::active', () => {
            on_toggle(icon, toggle.active);
        });

        return row;
    }
}

// function init() {
//     // ExtensionUtils.initTranslations();
// }

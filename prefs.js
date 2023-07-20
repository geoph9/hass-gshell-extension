const {Adw, Gio, Gtk, Secret} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Settings = Me.imports.settings;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

class HassPrefs {

    constructor(window) {
        this.window = window;
        this._settings = ExtensionUtils.getSettings();
        this._mscOptions = new Settings.MscOptions();

        this.togglablesPage = null;
        this.togglablesGroup = null;
        this.togglablesRows = [];

        this.sensorsPage = null;
        this.sensorsGroup = null;
        this.sensorsRows = [];
    }

    build() {
        this.buildGeneralSettingsPage();
        this.buildTogglableSettingsPage();
        this.buildSensorsSettingsPage();

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

    buildTogglableSettingsPage() {
        this.togglablesPage = new Adw.PreferencesPage({
            title: _('Togglables'),
            icon_name: "system-shutdown-symbolic",
        });

        this.togglablesGroup = new Adw.PreferencesGroup({ title: _("Choose which togglables should appear in the menu:")});
        this.togglablesPage.add(this.togglablesGroup);
        this.window.add(this.togglablesPage);
        this.refreshTogglableSettingsPage();
        Utils.connectSettings([Settings.HASS_ENTITIES_CACHE], this.refreshTogglableSettingsPage.bind(this));
    }

    refreshTogglableSettingsPage(togglables=null) {
        this.deleteTogglablesRows();
        if (!togglables) {
            Utils.getTogglables(
                (togglables) => this.refreshTogglableSettingsPage(togglables),
                () => this.refreshTogglableSettingsPage([])
            );
            return;
        }

        if (!togglables.length) {
            let row = this.createTextRow(
                _('No togglable found. Please check your Home-Assistant connection settings.')
            );
            this.togglablesRows.push(row);
            this.togglablesGroup.add(row);
            return;
        }

        let enabledEntities = this._mscOptions.enabledEntities;
        for (let tog of togglables) {
            let row = this.createEntityRow(
              tog,
              enabledEntities.includes(tog.entity_id),
              (tog, checked) => {
                  Utils._log(
                      "%s %s (%s) as togglable in menu",
                      [checked ? "Check" : "Uncheck", tog.name, tog.entity_id]
                  );
                  let currentEntities = this._mscOptions.enabledEntities;
                  let index = currentEntities.indexOf(tog.entity_id);
                  if (index > -1 && !checked) { // then it exists and so we pop
                      Utils._log(
                          "entity %s (%s) currently present, remove it",
                          [tog.name, tog.entity_id]
                      );
                      currentEntities.splice(index, 1);
                  }
                  else if (index <= -1 && checked) {
                      Utils._log(
                          "entity %s (%s) not currently present, add it",
                          [tog.name, tog.entity_id]
                      );
                      currentEntities.push(tog.entity_id);
                  }
                  else {
                      Utils._log(
                          "entity %s (%s) currently %s, no change",
                          [tog.name, tog.entity_id, checked ? "present" : "not present"]
                      );
                      return;
                  }
                  this._mscOptions.enabledEntities = togglables.map(
                      ent => ent.entity_id
                  ).filter(
                      ent => currentEntities.includes(ent)
                  );
                  Utils._log(
                      "%s togglable entities enabled: %s",
                      [this._mscOptions.enabledEntities.length, this._mscOptions.enabledEntities.join(', ')]
                  );
              }
          );
          this.togglablesRows.push(row);
          this.togglablesGroup.add(row);
        }
    }

    deleteTogglablesRows() {
        // Remove previously created togglable rows
        for (let row of this.togglablesRows)
            this.togglablesGroup.remove(row);
        this.togglablesRows = [];
    }

    buildSensorsSettingsPage() {
        this.sensorsPage = new Adw.PreferencesPage({
            title: _('Sensors'),
            icon_name: "weather-clear-symbolic",
        });

        this.sensorsGroup = new Adw.PreferencesGroup({ title: _("Choose which sensors should appear on the panel:")});
        this.sensorsPage.add(this.sensorsGroup);
        this.window.add(this.sensorsPage);
        this.refreshSensorsSettingsPage();
        Utils.connectSettings([Settings.HASS_ENTITIES_CACHE], this.refreshSensorsSettingsPage.bind(this));
    }

    refreshSensorsSettingsPage(sensors=null) {
        this.deleteSensorsRows();
        if (!sensors) {
            Utils.getSensors(
                (sensors) => this.refreshSensorsSettingsPage(sensors),
                () => this.refreshSensorsSettingsPage([])
            );
            return;
        }

        if (!sensors.length) {
            let row = this.createTextRow(
                _('No sensor found. Please check your Home-Assistant connection settings.')
            );
            this.sensorsRows.push(row);
            this.sensorsGroup.add(row);
            return;
        }

        let enabledSensors = this._mscOptions.enabledSensors;
        for (let sensor of sensors) {
            let row = this.createEntityRow(
                sensor,
                enabledSensors.includes(sensor.entity_id),
                (sensor, checked) => {
                  Utils._log(
                      "%s %s (%s) as panel sensor",
                      [checked ? "Check" : "Uncheck", sensor.name, sensor.entity_id]
                  );
                  let currentSensors = this._mscOptions.enabledSensors;
                  let index = currentSensors.indexOf(sensor.entity_id);
                  if (index > -1 && !checked) { // then it exists and so we pop
                      Utils._log(
                          "Sensor %s (%s) currently present, remove it",
                          [sensor.name, sensor.entity_id]
                      );
                      currentSensors.splice(index, 1);
                  }
                  else if (index <= -1 && checked) {
                      Utils._log(
                          "Sensor %s (%s) not currently present, add it",
                          [sensor.name, sensor.entity_id]
                      );
                      currentSensors.push(sensor.entity_id);
                  }
                  else {
                      Utils._log(
                          "Sensor %s (%s) currently %s, no change",
                          [sensor.name, sensor.entity_id, checked ? "present" : "not present"]
                      );
                      return;
                  }
                  this._mscOptions.enabledSensors = sensors.map(
                      ent => ent.entity_id
                  ).filter(
                      ent => currentSensors.includes(ent)
                  );
                  Utils._log(
                      "%s sensors enabled: %s",
                      [this._mscOptions.enabledSensors.length, this._mscOptions.enabledSensors.join(', ')]
                  );
                }
            );
            this.sensorsRows.push(row);
            this.sensorsGroup.add(row);
        }
    }

    deleteSensorsRows() {
        // Remove previously created sensors rows
        for (let row of this.sensorsRows)
            this.sensorsGroup.remove(row);
        this.sensorsRows = [];
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

    createEntityRow(entity, checked, on_toggle) {
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

    createTextRow(text) {
        return new Adw.ActionRow({
            title: text,
        });
    }
}

function init() {
    ExtensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    Utils.init();
    let prefs = new HassPrefs(window);
    prefs.build();
}

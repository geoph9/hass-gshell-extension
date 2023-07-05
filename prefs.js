const {Adw, Gio, Gtk, Secret} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Settings = Me.imports.settings;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

function init() {
    // schema = _settings.settings_schema;
    ExtensionUtils.initTranslations();
    Utils._log("initializing %s Preferences", [Me.metadata.name]);
}

function fillPreferencesWindow(window) {
    window._settings = ExtensionUtils.getSettings();

    buildGeneralSettingsPage(window);
    Utils.getTogglables((togglables) => buildTogglableSettingsPage(window, togglables));
    Utils.getSensors((sensors) => buildSensorsSettingsPage(window, sensors));

    // Enable search on settings
    window.search_enabled = true;
}

function buildGeneralSettingsPage(window) {
    let page = new Adw.PreferencesPage({
        title: _('General Settings'),
        icon_name: "preferences-other-symbolic",
    });

    const general_group = new Adw.PreferencesGroup({ title: _('General Settings')});
    page.add(general_group);

    general_group.add(createStringSettingRow(Settings.HASS_URL, window._settings));
    general_group.add(createAccessTokenSettingRow());
    general_group.add(createBooleanSettingRow(Settings.SHOW_NOTIFICATIONS_KEY, window._settings));
    general_group.add(createBooleanSettingRow(Settings.DEBUG_MODE, window._settings));

    const refresh_group = new Adw.PreferencesGroup({ title: _('Refresh sensors')});
    page.add(refresh_group);

    refresh_group.add(createBooleanSettingRow(Settings.DO_REFRESH, window._settings));
    refresh_group.add(createStringSettingRow(Settings.REFRESH_RATE, window._settings));

    const icon_group = new Adw.PreferencesGroup({ title: _('Panel Icon Options:')});
    page.add(icon_group);

    const mscOptions = new Settings.MscOptions();
    let validIcons = mscOptions.validIcons;
    let currentIcon = mscOptions.panelIcon;
    let iconGroup = new Gtk.CheckButton();
    for (let icon of validIcons) {
        icon_group.add(
          createIconRow(
            icon,
            icon == currentIcon,
            iconGroup,
            (icon) => {
              mscOptions.panelIcon = icon;
            }
          )
        );
    }

    window.add(page);
}

function buildTogglableSettingsPage(window, togglables) {
    let page = new Adw.PreferencesPage({
        title: _('Togglables'),
        icon_name: "system-shutdown-symbolic",
    });

    const group = new Adw.PreferencesGroup({ title: _('Choose Togglable Entities:')});
    page.add(group);

    const mscOptions = new Settings.MscOptions();

    let enabledEntities = mscOptions.enabledEntities;
    for (let tog of togglables) {
        group.add(
            createEntityRow(
              tog,
              enabledEntities.includes(tog.entity_id),
              (tog, checked) => {
                  Utils._log(
                      "%s %s (%s) as togglable in menu",
                      [checked ? "Check" : "Uncheck", tog.name, tog.entity_id]
                  );
                  let currentEntities = mscOptions.enabledEntities;
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
                  mscOptions.enabledEntities = togglables.map(
                      ent => ent.entity_id
                  ).filter(
                      ent => currentEntities.includes(ent)
                  );
                  Utils._log(
                      "%s togglable entities enabled: %s",
                      [mscOptions.enabledEntities.length, mscOptions.enabledEntities.join(', ')]
                  );
              }
          )
      );
    }

    window.add(page);
}

function buildSensorsSettingsPage(window, sensors) {
    let page = new Adw.PreferencesPage({
        title: _('Sensors'),
        icon_name: "weather-clear-symbolic",
    });

    const group = new Adw.PreferencesGroup({ title: _("Choose Which Sensors Should Appear on the Panel:")});
    page.add(group);

    const mscOptions = new Settings.MscOptions();

    let enabledSensors = mscOptions.enabledSensors;
    for (let sensor of sensors) {
        group.add(
          createEntityRow(
              sensor,
              enabledSensors.includes(sensor.entity_id),
              (sensor, checked) => {
                Utils._log(
                    "%s %s (%s) as panel sensor",
                    [checked ? "Check" : "Uncheck", sensor.name, sensor.entity_id]
                );
                let currentSensors = mscOptions.enabledSensors;
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
                mscOptions.enabledSensors = sensors.map(
                    ent => ent.entity_id
                ).filter(
                    ent => currentSensors.includes(ent)
                );
                Utils._log(
                    "%s sensors enabled: %s",
                    [mscOptions.enabledSensors.length, mscOptions.enabledSensors.join(', ')]
                );
              }
          )
      );
    }

    window.add(page);
}

function createBooleanSettingRow(name, settings) {
    let key = settings.settings_schema.get_key(name);
    let row = new Adw.ActionRow({
        title: _(key.get_summary()),
        subtitle: _(key.get_description()),
    });

    // Create a switch and bind its value to the `show-indicator` key
    let toggle = new Gtk.Switch({
        active: settings.get_boolean(name),
        valign: Gtk.Align.CENTER,
    });
    settings.bind(name, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);

    // Add the switch to the row
    row.add_suffix(toggle);
    row.activatable_widget = toggle;

    return row;
}

function createStringSettingRow(name, settings) {
    let key = settings.settings_schema.get_key(name);
    let row = new Adw.EntryRow({
        title: _(key.get_summary()),
        text: settings.get_string(name),
    });

    row.connect('entry-activated', () => {
        settings.set_string(name, row.get_text())
    });

    return row;
}

function createAccessTokenSettingRow(settings) {
    let row = new Adw.PasswordEntryRow({
        title: _("Access Token"),
    });

    row.connect('entry-activated', () => {
      Utils._log('Access token changed: "%s"', [row.get_text()]);
      let new_value = row.get_text();
      if (!new_value) return;
      Secret.password_store_sync(
          Utils.getTokenSchema(),
          {"token_string": "user_token"},
          Secret.COLLECTION_DEFAULT,
          "long_live_access_token",
          row.get_text(),
          null
      );
      row.set_text('');
      // Always force reload entities cache in case of HASS Token change and invalidate it in case
      // of error
      Utils.getEntities(null, () => Utils.invalidateEntitiesCache(), true);
    });

    return row;
}

function createIconRow(icon, checked,  icon_group, on_toggle) {
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

function createEntityRow(entity, checked, on_toggle) {
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

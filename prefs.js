import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Secret from 'gi://Secret';

import * as Utils from './utils.js';
import * as Settings from './settings.js';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


/**
 * Case-insensitive substring match (e.g. "cpu" matches "CPU Temperature").
 */
function matchesQuery(query, text) {
    // Coerce to string: an entity may lack a friendly_name, so text can be undefined.
    query = String(query ?? "").toLowerCase();
    text = String(text ?? "").toLowerCase();
    return text.includes(query);
}


class SettingsPage {
    constructor(type, window, mscOptions) {
        if (type !== "togglable" && type !== "runnable" && type !== "sensor")
            throw new Error(`Type ${type} is not supported in SettingsPage`)

        this.type = type;
        this.window = window;
        this._mscOptions = mscOptions;
        this.page = null;
        this.group = null;
        this.searchEntry = null;
        this.rows = [];
        this.orderGroup = null;
        this.orderRows = [];
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

    get groupTitle() {
        if (this.type === "sensor")
            return _("Choose which sensors should appear in the panel:");
        return _(`Choose which ${this.type}s should appear in the menu:`);
    }

    build() {
        this.page = new Adw.PreferencesPage({
            title: this.pageConfig.title,
            icon_name: this.pageConfig.iconName,
        });

        if (this.type === "sensor") {
            this.page.add(this.buildLayoutGroup());

            this.orderGroup = new Adw.PreferencesGroup({
                title: _("Order in the panel"),
                description: _(
                    "The sensors are shown in the panel from left to right, in the order below. "
                    + "Use the arrows to move an entry and the + button to place a separator "
                    + "after a sensor, in order to group the sensors that belong together."
                ),
            });
            this.page.add(this.orderGroup);
        }

        this.group = new Adw.PreferencesGroup({ title: this.groupTitle });
        this.searchEntry = new Gtk.SearchEntry({
            placeholder_text: _("Search…"),
            valign: Gtk.Align.CENTER,
        });
        this.searchEntry.connect('search-changed', () => this.filterRows());
        this.group.header_suffix = this.searchEntry;
        this.page.add(this.group);
        this.window.add(this.page);
        Utils.connectSettings([Settings.HASS_ENTITIES_CACHE], this.refresh.bind(this));
        if (this.type === "sensor") {
            // The order group content depends on both the entities cache and the list of
            // enabled sensors, which is also changed from this page (checkboxes and arrows).
            Utils.connectSettings(
                [Settings.HASS_ENTITIES_CACHE, Settings.HASS_ENABLED_SENSOR_IDS],
                this.refreshOrder.bind(this)
            );
            this.refreshOrder();
        }
        this.refresh();
    }

    /**
     * Build the group holding the panel layout options (separator style and spacing).
     *
     * @return {Adw.PreferencesGroup}
     */
    buildLayoutGroup() {
        let group = new Adw.PreferencesGroup({
            title: _("Panel appearance"),
            description: _("How the sensors and the separators are drawn in the panel."),
        });

        let separatorLabels = {
            'none': _("None"),
            'space': _("Space"),
            'dot': _("Dot (·)"),
            'line': _("Line (|)"),
        };
        let model = new Gtk.StringList({
            strings: Settings.VALID_SENSOR_SEPARATORS.map(value => separatorLabels[value]),
        });

        let currentIndex = Settings.VALID_SENSOR_SEPARATORS.indexOf(
            this._mscOptions.sensorSeparator
        );
        let comboRow = new Adw.ComboRow({
            title: _("Separator style"),
            subtitle: _("How the separators placed below are drawn (\"None\" hides them all)."),
            model: model,
        });
        // Set the current value only once the model is in place, then connect the handler so
        // that the initial selection does not write back to the settings.
        comboRow.selected = currentIndex > -1 ? currentIndex : 0;
        comboRow.connect('notify::selected', () => {
            let value = Settings.VALID_SENSOR_SEPARATORS[comboRow.selected];
            if (!value || value === this._mscOptions.sensorSeparator) return;
            Utils._log("Set panel sensor separator to %s", [value]);
            this._mscOptions.sensorSeparator = value;
        });
        group.add(comboRow);

        let spacingRow = new Adw.ActionRow({
            title: _("Spacing"),
            subtitle: _("Space (in pixels) between two sensors. A separator gets it twice."),
        });
        let spinButton = new Gtk.SpinButton({
            adjustment: Gtk.Adjustment.new(this._mscOptions.sensorSpacing, 0, 24, 1, 2, 0),
            valign: Gtk.Align.CENTER,
            numeric: true,
        });
        spinButton.connect('value-changed', () => {
            let value = spinButton.get_value_as_int();
            if (value === this._mscOptions.sensorSpacing) return;
            Utils._log("Set panel sensor spacing to %s px", [value]);
            this._mscOptions.sensorSpacing = value;
        });
        spacingRow.add_suffix(spinButton);
        spacingRow.activatable_widget = spinButton;
        group.add(spacingRow);

        return group;
    }

    /**
     * Rebuild the rows of the "Order in the panel" group.
     *
     * @param {Array} entries The known sensor entities (fetched asynchronously if not provided)
     */
    refreshOrder(entries=null) {
        if (!this.orderGroup) return;
        this.deleteOrderRows();

        if (!entries) {
            Utils.getEntitiesByType(
                this.type,
                (results) => this.refreshOrder(results),
                () => this.refreshOrder([])
            );
            return;
        }

        // Map the entity ids to their friendly name, to be able to label the rows of sensors
        // that are enabled but currently not reported by Home-Assistant.
        let names = {};
        for (let entry of entries)
            names[entry.entity_id] = entry.name;

        let layout = this._mscOptions.sensorLayout;
        if (!layout.length) {
            let row = SettingsPage.createTextRow(
                _("No sensor selected yet. Select some sensors below to order them here.")
            );
            this.orderRows.push(row);
            this.orderGroup.add(row);
            return;
        }

        for (let [idx, item] of layout.entries()) {
            let row;
            if (item === Settings.PANEL_SEPARATOR_ITEM) {
                row = SettingsPage.createSeparatorRow(
                    idx,
                    layout.length,
                    (index, offset) => this.moveLayoutItem(index, offset),
                    (index) => this.removeLayoutItem(index)
                );
            }
            else {
                row = SettingsPage.createOrderRow(
                    names[item] || item,
                    item,
                    idx,
                    layout.length,
                    (index, offset) => this.moveLayoutItem(index, offset),
                    (index) => this.insertSeparatorAfter(index)
                );
            }
            this.orderRows.push(row);
            this.orderGroup.add(row);
        }
    }

    /**
     * Move a sensor or a separator in the panel layout.
     *
     * @param {Number} index The current position of the entry
     * @param {Number} offset The move to apply (-1 to move left, +1 to move right)
     */
    moveLayoutItem(index, offset) {
        let layout = this._mscOptions.sensorLayout;
        let target = index + offset;
        if (index < 0 || index >= layout.length || target < 0 || target >= layout.length)
            return;
        Utils._log(
            "Move panel entry %s from position %s to position %s",
            [layout[index], index, target]
        );
        let [moved] = layout.splice(index, 1);
        layout.splice(target, 0, moved);
        // Writing the setting triggers a refresh of this group (and of the panel)
        this._mscOptions.sensorLayout = layout;
    }

    /**
     * Place a separator right after the given entry of the panel layout.
     *
     * @param {Number} index The position of the entry to place a separator after
     */
    insertSeparatorAfter(index) {
        let layout = this._mscOptions.sensorLayout;
        if (index < 0 || index >= layout.length) return;
        Utils._log("Insert a separator after %s (position %s)", [layout[index], index]);
        layout.splice(index + 1, 0, Settings.PANEL_SEPARATOR_ITEM);
        this._mscOptions.sensorLayout = layout;
    }

    /**
     * Remove an entry (a separator) from the panel layout.
     *
     * @param {Number} index The position of the entry to remove
     */
    removeLayoutItem(index) {
        let layout = this._mscOptions.sensorLayout;
        if (index < 0 || index >= layout.length) return;
        Utils._log("Remove panel entry %s (position %s)", [layout[index], index]);
        layout.splice(index, 1);
        this._mscOptions.sensorLayout = layout;
    }

    deleteOrderRows() {
        for (let row of this.orderRows)
            this.orderGroup.remove(row);
        this.orderRows = [];
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
                  // Keep the list in its current order (newly checked entries are appended at
                  // the end), so that the order chosen on the "Order in the panel" group is
                  // preserved.
                  this._mscOptions.setEnabledByType(this.type, currentEntities);
                  Utils._log(
                      "%s entries enabled: %s",
                      [this._mscOptions.getEnabledByType(this.type).length, this._mscOptions.getEnabledByType(this.type).join(', ')]
                  );
                }
            );
            this.rows.push(row);
            this.group.add(row);
        }
        this.filterRows();
    }

    filterRows() {
        let query = this.searchEntry.text;
        for (let row of this.rows) {
            // Rows without an entity (e.g. the "no entity found" text row) always stay visible.
            row.visible = !row._searchFields
                || row._searchFields.some(field => matchesQuery(query, field));
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
        // Match search queries against name and entity_id independently.
        row._searchFields = [entity.name, entity.entity_id];

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

    /**
     * Build the button box shared by the rows of the "Order in the panel" group.
     *
     * @param {Number} index The position of the entry in the layout
     * @param {Number} count The total number of entries in the layout
     * @param {Function} on_move Called with (index, offset) to move the entry
     * @return {Gtk.Box}
     */
    static createMoveButtons(index, count, on_move) {
        let box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });

        let upButton = new Gtk.Button({
            icon_name: "go-up-symbolic",
            tooltip_text: _("Move to the left in the panel"),
            sensitive: index > 0,
            valign: Gtk.Align.CENTER,
        });
        upButton.add_css_class("flat");
        upButton.connect('clicked', () => on_move(index, -1));
        box.append(upButton);

        let downButton = new Gtk.Button({
            icon_name: "go-down-symbolic",
            tooltip_text: _("Move to the right in the panel"),
            sensitive: index < count - 1,
            valign: Gtk.Align.CENTER,
        });
        downButton.add_css_class("flat");
        downButton.connect('clicked', () => on_move(index, 1));
        box.append(downButton);

        return box;
    }

    static createOrderRow(name, entity_id, index, count, on_move, on_insert_separator) {
        let row = new Adw.ActionRow({
            title: name,
            subtitle: entity_id,
        });

        let box = SettingsPage.createMoveButtons(index, count, on_move);

        let insertButton = new Gtk.Button({
            icon_name: "list-add-symbolic",
            tooltip_text: _("Place a separator after this sensor"),
            valign: Gtk.Align.CENTER,
        });
        insertButton.add_css_class("flat");
        insertButton.connect('clicked', () => on_insert_separator(index));
        box.append(insertButton);

        row.add_suffix(box);

        return row;
    }

    static createSeparatorRow(index, count, on_move, on_remove) {
        let row = new Adw.ActionRow({
            title: _("— Separator —"),
            subtitle: _("Groups the sensors before and after it"),
        });
        row.add_css_class("dim-label");

        let box = SettingsPage.createMoveButtons(index, count, on_move);

        let removeButton = new Gtk.Button({
            icon_name: "list-remove-symbolic",
            tooltip_text: _("Remove this separator"),
            valign: Gtk.Align.CENTER,
        });
        removeButton.add_css_class("flat");
        removeButton.connect('clicked', () => on_remove(index));
        box.append(removeButton);

        row.add_suffix(box);

        return row;
    }

    static createTextRow(text) {
        return new Adw.ActionRow({
            title: text,
        });
    }

    destroy() {
        this.page = null;
        this.group = null;
        this.searchEntry = null;
        this.rows = [];
        this.orderGroup = null;
        this.orderRows = [];
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
            this._settings = null;
            this._mscOptions.destroy();
            this._mscOptions = null;
            this.togglablesPage.destroy();
            this.togglablesPage = null;
            this.runnablesPage.destroy();
            this.runnablesPage = null;
            this.sensorsPage.destroy();
            this.sensorsPage = null;
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

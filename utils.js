// For the GET Requests
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Me = imports.misc.extensionUtils.getCurrentExtension();
// new sesssion
var soupSyncSession = new Soup.SessionSync();

function setNewState(url) {
    let message = Soup.Message.new(type, url);
    let responseCode = soupSyncSession.send_message(message);

    if(responseCode == 200) {
        try {
            return JSON.parse(message['response-body'].data);
        } catch(error) {
            log("ERROR OCCURRED WHILE SENDING GET REQUEST TO " + url + ". ERROR WAS: " + error);
            return false;
        }
    }
    return -1;
}

function getSettings(schema_name) {
  if (schema_name !== undefined) {
    schema_name = `org.gnome.shell.extensions.${schema_name}`;
  } else {
    schema_name = Me.metadata['settings-schema'];
  }
  let GioSSS = Gio.SettingsSchemaSource;
  let schemaSource = GioSSS.new_from_directory(
    Me.dir.get_child("schemas").get_path(),
    GioSSS.get_default(),
    false
  );
  let schemaObj = schemaSource.lookup(schema_name, true);
  if (!schemaObj) {
    throw new Error('Schema ' + schema + ' could not be found for extension ' + Me.metadata.uuid + '. Please check your installation.');
  }
  return new Gio.Settings({ settings_schema : schemaObj });
}

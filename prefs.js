const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

function init () {}

function buildPrefsWidget () {
  let widget = new MyPrefsWidget();
  widget.show_all();
  return widget;
}

const MyPrefsWidget = GObject.registerClass(
class MyPrefsWidget extends Gtk.Box {

  _init (params) {

    super._init(params);

    this.margin = 20;
    this.set_spacing(15);
    this.set_orientation(Gtk.Orientation.VERTICAL);

    this.connect('destroy', Gtk.main_quit);

    let myLabel = new Gtk.Label({
      label : "Translated Text"    
    });

    let spinButton = new Gtk.SpinButton();
    spinButton.set_sensitive(true);
    spinButton.set_range(-60, 60);
    spinButton.set_value(0);
    spinButton.set_increments(1, 2);

    spinButton.connect("value-changed", function (w) {
      log(w.get_value_as_int());
    });

    let hBox = new Gtk.Box();
    hBox.set_orientation(Gtk.Orientation.HORIZONTAL);

    hBox.pack_start(myLabel, false, false, 0);
    hBox.pack_end(spinButton, false, false, 0);

    this.add(hBox);
  }

});
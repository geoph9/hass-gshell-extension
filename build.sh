#!/bin/bash

# Get gnome version
vers=$(gnome-shell --version | cut -d ' ' -f 3-)
if [[ $vers == 40* ]] ; then  # e.g. convert 40.0 to 40
  vers="40";
fi

function check_releases() {
  echo "$0: Could not find release version $1."
  echo "$0: Check the available versions from the releases page on github:"
  echo "    https://github.com/geoph9/hass-gshell-extension/releases"
  exit 1;
}

if [[ $# -ge 1 ]] ; then
  echo "Usage: $0 [-h | --help] "
  echo 
  echo "The version installed will depend on your gnome-shell version."
  echo "You can check the available versions from the releases page on github:"
  echo "  https://github.com/geoph9/hass-gshell-extension/releases"
  echo
  exit 1;
fi
echo "$0: Downloading version $vers..."


# Download with wget (you can also download manually).
wget https://github.com/geoph9/hass-gshell-extension/releases/download/"$vers"/hass-gshell@geoph9-on-github.shell-extension.zip || check_releases "$vers"
# Unzip contents
unzip hass-gshell@geoph9-on-github.shell-extension.zip -d hass-gshell@geoph9-on-github
# Remove zip
rm hass-gshell@geoph9-on-github.shell-extension.zip
# Move directory to the extensions directory
mkdir -p "$HOME"/.local/share/gnome-shell/extensions/
rm -rf "$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
mv hass-gshell@geoph9-on-github "$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github

# Enable extension (the session needs to be restarted before that)
# gnome-extensions enable hass-gshell@geoph9-on-github

exit 0;
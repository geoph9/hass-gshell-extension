#!/bin/bash

vers="3.38"

function check_releases() {
    echo "$0: Could not find release version $1."
    echo "$0: Check the available versions from the releases page on github:"
    echo "    https://github.com/geoph9/hass-gshell-extension/releases"
    exit 1;
}

if [[ $# -ge 1 ]] ; then
  if [[ "$1" = "-h" || "$1" = "--help" ]] ; then 
    echo "Usage: $0 [-h | --help] [version]"
    echo 
    echo "The version parameter is optional and defaults to 3.38."
    echo "You can check the available versions from the releases page on github:"
    echo "  https://github.com/geoph9/hass-gshell-extension/releases"
    echo
    exit 1;
  fi
  vers="$1";
  echo "$0: Downloading version $vers..."
fi


# Download with wget (you can also download manually).
wget https://github.com/geoph9/hass-gshell-extension/releases/download/"$vers"/hass-gshell@geoph9-on-github.shell-extension.zip || check_releases "$vers"
# Unzip contents
unzip hass-gshell@geoph9-on-github.shell-extension.zip -d hass-gshell@geoph9-on-github
# Remove zip
rm hass-gshell@geoph9-on-github.shell-extension.zip
# Move directory to the extensions directory
mkdir -p "$HOME"/.local/share/gnome-shell/extensions/
mv hass-gshell@geoph9-on-github "$HOME"/.local/share/gnome-shell/extensions/

# Enable extension
gnome-extensions enable hass-gshell@geoph9-on-github

exit 0;
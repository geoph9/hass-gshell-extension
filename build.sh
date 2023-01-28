#!/bin/bash

# Get gnome version
vers=$(gnome-shell --version | cut -d ' ' -f 3- | cut -d. -f1)
if [[ $vers == 40* ]] ; then  # e.g. convert 40.0 to 40
  vers="40";
fi
if [[ -z $vers ]] ; then
  # Are you not using gnome?
  echo "Could not identify gnome version. Aborting..."
  exit 1;
fi

function get_help() {
  echo "Usage: $0 [-h | --help] [-l | --latest] "
  echo 
  echo "Arguments:"
  echo "    -h | --help: Show this help message."
  echo "    -l | --latest: Download the latest version directly from the 'master' branch on github."
  echo
  echo "The latter means that you will have the latest features but you may also encounter"
  echo "some bugs. Please make an issue on github if you encounter any bug!"
  echo
  echo "The version installed will depend on your gnome-shell version."
  echo "You can check the available versions from the releases page on github:"
  echo "  https://github.com/geoph9/hass-gshell-extension/releases"
  echo
}

function check_releases() {
  echo "$0: Error: You either don't have 'wget' installed or the version $1 is invalid."
  echo "$0: Check the available versions from the releases page on github:"
  echo "    https://github.com/geoph9/hass-gshell-extension/releases"
  exit 1;
}

function download_stable() {
  echo "$0: Downloading extension for version $vers..."

  # Download with wget (you can also download manually).
  wget -q https://github.com/geoph9/hass-gshell-extension/releases/download/"$vers"/hass-gshell@geoph9-on-github.shell-extension.zip || check_releases "$vers"
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
}

function download_latest() {
  echo "$0: Downloading latest version directly from github. This may result in unstable behavior."
  mkdir -p "$HOME"/.local/share/gnome-shell/extensions
  ext_dir="$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github
  git clone https://github.com/geoph9/hass-gshell-extension.git "$ext_dir"
  # Delete the screenshots/README since they take up a lot of space.
  rm -rf "$ext_dir"/screenshots "$ext_dir"/README.md "$ext_dir"/chromecast
  echo
  # echo "$0: Trying to enable the extension. This may result in an error if you don't have the 'gnome-extension' cli installed but it is okay."
  # echo "$0: You will still need to restart your session in order to make it work."
  # gnome-extensions enable hass-gshell-local@geoph9-on-github
  exit 0;
}

while [[ $# -gt 0 ]] ; do
  key="$1"

  case $key in
      -h|--help)
      get_help
      exit 0
      shift
      ;;
      -l|--latest)
      download_latest
      shift
      ;;
      *)    # unknown option
      echo "$0: Unknown option $1."
      get_help
      read -p "$0: Do you want to continue with the default behavior? [y|N]: " -n 1 -r
      echo 
	    if [[ "$REPLY" =~ ^[Yy]$ ]] ; then
        break
      else
        echo "$0: Aborting..."
        exit 1;
      fi
      shift # past argument
      ;;
  esac
done

download_stable
glib-compile-schemas "$HOME"/.local/share/gnome-shell/extensions/hass-gshell@geoph9-on-github

exit 0;

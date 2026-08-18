#!/bin/sh

set -u

PACKAGE_NAME='gl-sdk4-ui-starlink-monitor'
RELEASE_BASE_URL='https://github.com/go-wombat/starlink-monitor/releases/download'

result_error() {
	printf 'error|%s\n' "$1"
	exit 0
}

valid_version() {
	candidate="$1"
	case "$candidate" in
		''|*[!0-9.]*|*.*.*.*) return 1 ;;
	esac

	previous_ifs="$IFS"
	IFS=.
	set -- $candidate
	IFS="$previous_ifs"
	[ "$#" -eq 3 ] || return 1
	for part in "$@"; do
		case "$part" in
			0|[1-9]|[1-9][0-9]*) ;;
			*) return 1 ;;
		esac
	done
}

version="${1:-}"
valid_version "$version" || result_error 'invalid_version'

for tool in curl sha256sum opkg awk; do
	command -v "$tool" >/dev/null 2>&1 || result_error 'update_tools_unavailable'
done

installed_version="$(opkg status "$PACKAGE_NAME" 2>/dev/null | awk '$1 == "Version:" { print $2; exit }')"
valid_version "$installed_version" || result_error 'installed_version_unavailable'
opkg compare-versions "$version" '>>' "$installed_version" || result_error 'not_newer'

umask 077
lock_dir='/tmp/starlink-monitor-update.lock'
work_dir="/tmp/starlink-monitor-update.$$"
if ! mkdir "$lock_dir" 2>/dev/null; then
	result_error 'update_busy'
fi
if ! mkdir "$work_dir" 2>/dev/null; then
	rmdir "$lock_dir" 2>/dev/null || true
	result_error 'temporary_storage_unavailable'
fi
trap 'rm -rf "$work_dir"; rmdir "$lock_dir" 2>/dev/null || true' EXIT HUP INT TERM

filename="${PACKAGE_NAME}_${version}_all.ipk"
release_url="${RELEASE_BASE_URL}/v${version}"
checksum_path="${work_dir}/SHA256SUMS"
package_path="${work_dir}/${filename}"

download() {
	curl \
		--silent \
		--show-error \
		--fail \
		--location \
		--proto '=https' \
		--proto-redir '=https' \
		--connect-timeout 15 \
		--max-time 120 \
		--output "$1" \
		"$2" 2>/dev/null
}

download "$checksum_path" "${release_url}/SHA256SUMS" || result_error 'checksum_download_failed'
download "$package_path" "${release_url}/${filename}" || result_error 'package_download_failed'

expected_checksum="$(awk -v filename="$filename" '
	$2 == filename {
		checksum = tolower($1)
		matches += 1
	}
	END {
		if (matches == 1 && length(checksum) == 64 && checksum !~ /[^0-9a-f]/) {
			print checksum
			exit 0
		}
		exit 1
	}
' "$checksum_path")" || result_error 'checksum_manifest_invalid'

actual_checksum="$(sha256sum "$package_path" 2>/dev/null | awk '{ print tolower($1) }')"
[ "$actual_checksum" = "$expected_checksum" ] || result_error 'checksum_mismatch'

if ! opkg install "$package_path" >"${work_dir}/opkg.log" 2>&1; then
	result_error 'install_failed'
fi

active_version="$(opkg status "$PACKAGE_NAME" 2>/dev/null | awk '$1 == "Version:" { print $2; exit }')"
[ "$active_version" = "$version" ] || result_error 'installed_version_mismatch'

printf 'ok|%s|%s\n' "$active_version" "$actual_checksum"

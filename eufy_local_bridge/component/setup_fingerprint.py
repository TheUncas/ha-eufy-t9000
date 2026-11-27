"""Read the public certificate fingerprint deposited by the add-on launcher."""
import os
import re
import stat

FILENAME = ".eufy-local-bridge-tls.sha256"


def _read_fingerprint(config_dir):
    # The add-on runs on Linux. HA installations without these protections
    # can still pair by entering the fingerprint from the add-on log.
    if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
        return None
    try:
        directory = os.open(config_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            parent = os.fstat(directory)
            if parent.st_uid != 0 or parent.st_mode & 0o022:
                return None
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
            fd = os.open(FILENAME, flags, dir_fd=directory)
            try:
                info = os.fstat(fd)
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                        or info.st_mode & 0o022 or info.st_nlink != 1):
                    return None
                value = os.read(fd, 66)
                if re.fullmatch(rb"[0-9a-f]{64}\n", value):
                    return value[:-1].decode("ascii")
            finally:
                os.close(fd)
        finally:
            os.close(directory)
    except OSError:
        return None
    return None


async def async_read_setup_fingerprint(hass):
    """Return the add-on's SHA-256 digest, if available through the trusted mount."""
    return await hass.async_add_executor_job(_read_fingerprint, hass.config.path())

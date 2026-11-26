/* Count UDP directions for one station. stdout is consumed by the local app. */
#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <inttypes.h>
#include <linux/capability.h>
#include <linux/filter.h>
#include <linux/if_ether.h>
#include <net/if.h>
#include <netpacket/packet.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

struct interface_count {
    unsigned int index;
    char name[IF_NAMESIZE];
    uint64_t sent, received;
};

static int station_address(const char *text, struct in_addr *ip) {
    if (inet_pton(AF_INET, text, ip) != 1) return 0;
    const uint32_t n = ntohl(ip->s_addr);
    return (n >> 24) == 10 || (n >> 20) == 0xac1 || (n >> 16) == 0xc0a8;
}

static int start_capture(struct in_addr station) {
    /* Protocol zero keeps the socket inactive until the kernel filter is locked. */
    int fd = socket(AF_PACKET, SOCK_DGRAM | SOCK_CLOEXEC | SOCK_NONBLOCK, 0);
    if (fd < 0) return -1;
    const uint32_t ip = ntohl(station.s_addr);
    struct sock_filter rules[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, SKF_AD_OFF + SKF_AD_PROTOCOL),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ETH_P_IP, 0, 7),
        BPF_STMT(BPF_LD | BPF_B | BPF_ABS, 9),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, IPPROTO_UDP, 0, 5),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 12),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ip, 2, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 16),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ip, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, 20), /* Only the fixed IPv4 header. */
        BPF_STMT(BPF_RET | BPF_K, 0)
    };
    struct sock_fprog filter = { .len = sizeof rules / sizeof rules[0], .filter = rules };
    int lock = 1;
    struct sockaddr_ll all = { .sll_family = AF_PACKET, .sll_protocol = htons(ETH_P_ALL) };
    struct __user_cap_header_struct header = { .version = _LINUX_CAPABILITY_VERSION_3 };
    struct __user_cap_data_struct none[2] = {0};
    if (setsockopt(fd, SOL_SOCKET, SO_ATTACH_FILTER, &filter, sizeof filter) ||
        setsockopt(fd, SOL_SOCKET, SO_LOCK_FILTER, &lock, sizeof lock) ||
        bind(fd, (struct sockaddr *)&all, sizeof all) ||
        prctl(PR_SET_NO_NEW_PRIVS, 1L, 0L, 0L, 0L) ||
        syscall(SYS_capset, &header, none)) {
        close(fd);
        return -1;
    }
    return fd;
}

static int64_t monotonic_ms(void) {
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now)) _exit(1);
    return (int64_t)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}

int main(int argc, char **argv) {
    struct in_addr station;
    if (argc != 2 || !station_address(argv[1], &station)) return 1;
    int fd = start_capture(station);
    if (fd < 0) return 1;
    puts("{\"ready\":true}");
    if (fflush(stdout)) return 1;

    struct interface_count counts[64] = {0};
    size_t used = 0;
    struct pollfd pollfd = { .fd = fd, .events = POLLIN };
    const int64_t deadline = monotonic_ms() + 90000;
    for (;;) {
        int remaining = (int)(deadline - monotonic_ms());
        if (remaining <= 0) break;
        int ready = poll(&pollfd, 1, remaining);
        if (ready < 0 && errno == EINTR) continue;
        if (ready < 0 || (pollfd.revents & (POLLERR | POLLHUP | POLLNVAL))) return 1;
        if (!ready) continue;
        unsigned char ip[20];
        struct sockaddr_ll link;
        socklen_t size = sizeof link;
        ssize_t length = recvfrom(fd, ip, sizeof ip, 0, (struct sockaddr *)&link, &size);
        if (length < 0 && (errno == EAGAIN || errno == EINTR)) continue;
        if (length != sizeof ip || link.sll_ifindex <= 0) return 1;
        size_t i = 0;
        unsigned int index = (unsigned int)link.sll_ifindex;
        while (i < used && counts[i].index != index) ++i;
        if (i == used) {
            if (used == sizeof counts / sizeof counts[0]) return 1;
            counts[i].index = index;
            /* Unusual names or removed interfaces still have a safe identifier in JSON. */
            char *name = counts[i].name;
            if (!if_indextoname(index, name) || strspn(name,
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-@") != strlen(name))
                snprintf(name, IF_NAMESIZE, "if%u", index);
            ++used;
        }
        if (memcmp(ip + 12, &station.s_addr, 4) == 0) ++counts[i].received;
        else ++counts[i].sent;
    }
    close(fd);
    fputs("{\"interfaces\":[", stdout);
    for (size_t i = 0; i < used; ++i) {
        printf("%s{\"name\":\"%s\",\"sent\":%" PRIu64 ",\"received\":%" PRIu64 "}",
               i ? "," : "", counts[i].name, counts[i].sent, counts[i].received);
    }
    puts("]}");
    return 0;
}

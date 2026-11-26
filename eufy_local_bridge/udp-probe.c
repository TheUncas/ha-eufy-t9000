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

/* The locked filter encodes the classification in its IPv4 snapshot length.
 * All lengths include the source address and exclude UDP and STUN bytes. */
enum snapshot_length { BINDING_ERROR = 17, BINDING_SUCCESS, BINDING_REQUEST, OTHER_UDP };
struct stun_counts { uint64_t requests, successes, errors; };

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
#define REQUIRE(op, value, fallback) \
    BPF_JUMP(BPF_JMP | (op), (value), 1, 0), BPF_STMT(BPF_RET | BPF_K, (fallback))
    struct sock_filter rules[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, SKF_AD_OFF + SKF_AD_PROTOCOL),
        REQUIRE(BPF_JEQ | BPF_K, ETH_P_IP, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_LEN, 0),
        REQUIRE(BPF_JGE | BPF_K, 20, 0),
        BPF_STMT(BPF_LD | BPF_B | BPF_ABS, 9),
        REQUIRE(BPF_JEQ | BPF_K, IPPROTO_UDP, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 12),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ip, 3, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, 16),
        REQUIRE(BPF_JEQ | BPF_K, ip, 0),

        /* Only inspect complete, unfragmented UDP datagrams. Check all lengths
         * before indirect loads: an out-of-bounds BPF load would drop the packet
         * entirely instead of counting it as ordinary UDP. */
        BPF_STMT(BPF_LD | BPF_B | BPF_ABS, 0),
        REQUIRE(BPF_JGE | BPF_K, 0x45, OTHER_UDP),
        BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x50, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, OTHER_UDP),
        BPF_STMT(BPF_LD | BPF_H | BPF_ABS, 6),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, 0x3fff, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, OTHER_UDP),
        BPF_STMT(BPF_LD | BPF_H | BPF_ABS, 2),
        BPF_STMT(BPF_MISC | BPF_TAX, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_LEN, 0),
        REQUIRE(BPF_JGE | BPF_X, 0, OTHER_UDP),
        BPF_STMT(BPF_MISC | BPF_TXA, 0),
        BPF_STMT(BPF_LDX | BPF_B | BPF_MSH, 0), /* X = IPv4 header length. */
        REQUIRE(BPF_JGE | BPF_X, 0, OTHER_UDP),
        BPF_STMT(BPF_ALU | BPF_SUB | BPF_X, 0),
        REQUIRE(BPF_JGE | BPF_K, 28, OTHER_UDP), /* UDP + fixed STUN headers. */
        BPF_STMT(BPF_ST, 0),
        BPF_STMT(BPF_LD | BPF_H | BPF_IND, 4),
        BPF_STMT(BPF_LDX | BPF_MEM, 0),
        REQUIRE(BPF_JEQ | BPF_X, 0, OTHER_UDP), /* UDP length = IPv4 payload. */
        BPF_STMT(BPF_ALU | BPF_SUB | BPF_K, 28),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, 3, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, OTHER_UDP),
        BPF_STMT(BPF_ST, 0),
        BPF_STMT(BPF_LDX | BPF_B | BPF_MSH, 0),
        BPF_STMT(BPF_LD | BPF_H | BPF_IND, 10),
        BPF_STMT(BPF_LDX | BPF_MEM, 0),
        REQUIRE(BPF_JEQ | BPF_X, 0, OTHER_UDP), /* STUN message length. */
        BPF_STMT(BPF_LDX | BPF_B | BPF_MSH, 0),
        BPF_STMT(BPF_LD | BPF_W | BPF_IND, 12),
        REQUIRE(BPF_JEQ | BPF_K, 0x2112a442, OTHER_UDP),
        BPF_STMT(BPF_LD | BPF_H | BPF_IND, 8),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0x0001, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, BINDING_REQUEST),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0x0101, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, BINDING_SUCCESS),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0x0111, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, BINDING_ERROR),
        BPF_STMT(BPF_RET | BPF_K, OTHER_UDP)
    };
#undef REQUIRE
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
    struct stun_counts sent = {0}, received = {0};
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
        if (length < BINDING_ERROR || length > OTHER_UDP || link.sll_ifindex <= 0) return 1;
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
        struct stun_counts *direction;
        if (memcmp(ip + 12, &station.s_addr, 4) == 0) {
            ++counts[i].received;
            direction = &received;
        } else {
            ++counts[i].sent;
            direction = &sent;
        }
        switch (length) {
        case BINDING_REQUEST: ++direction->requests; break;
        case BINDING_SUCCESS: ++direction->successes; break;
        case BINDING_ERROR: ++direction->errors; break;
        }
    }
    close(fd);
    fputs("{\"interfaces\":[", stdout);
    for (size_t i = 0; i < used; ++i) {
        printf("%s{\"name\":\"%s\",\"sent\":%" PRIu64 ",\"received\":%" PRIu64 "}",
               i ? "," : "", counts[i].name, counts[i].sent, counts[i].received);
    }
    printf("],\"stun\":{\"requestsSent\":%" PRIu64 ",\"requestsReceived\":%" PRIu64
           ",\"successesSent\":%" PRIu64 ",\"successesReceived\":%" PRIu64
           ",\"errorsSent\":%" PRIu64 ",\"errorsReceived\":%" PRIu64 "}}\n",
           sent.requests, received.requests, sent.successes, received.successes,
           sent.errors, received.errors);
    return 0;
}

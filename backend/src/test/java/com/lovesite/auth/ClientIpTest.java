package com.lovesite.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClientIpTest {

    @Test
    void anIpv4AddressIsItsOwnNetwork() {
        assertThat(ClientIp.network("198.51.100.7")).isEqualTo("198.51.100.7");
    }

    @Test
    void ipv6AddressesOfOneSlash64ShareANetwork() {
        assertThat(ClientIp.network("2001:db8:1:2::1")).isEqualTo(ClientIp.network("2001:db8:1:2:ffff:0:0:9"));
        assertThat(ClientIp.network("2001:db8:1:2::1")).isNotEqualTo(ClientIp.network("2001:db8:1:3::1"));
    }

    @Test
    void anythingUnparsableIsKeptAsItIs() {
        assertThat(ClientIp.network("not:an:address::zz")).isEqualTo("not:an:address::zz");
        assertThat(ClientIp.network(":zz::1")).isEqualTo(":zz::1");
        assertThat(ClientIp.network("::1::2")).isEqualTo("::1::2");
        assertThat(ClientIp.network(null)).isEqualTo("null");
    }

    @Test
    void anIpv4MappedAddressCountsAsTheIpv4Address() {
        assertThat(ClientIp.network("::ffff:198.51.100.7")).isEqualTo("198.51.100.7");
    }
}

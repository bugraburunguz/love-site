package com.lovesite;

import com.lovesite.storage.StorageProperties;
import com.lovesite.storage.StorageService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.Transferable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Garage, a self-hosted S3 server, matches the allowed CORS headers case-sensitively. Browsers send the preflight's
 * Access-Control-Request-Headers in lower case, so the rule must name "content-type" in lower case or every upload is
 * refused before it starts. The CLI calls set up a single node the way a fresh install does.
 */
class GarageCorsTest {

    static final String BUCKET = "lovesite";
    static final String KEY_ID = "GK0123456789abcdef01234567";
    static final String SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    static final String ORIGIN = "https://love.example";

    static final GenericContainer<?> GARAGE = new GenericContainer<>("dxflrs/garage:v2.1.0")
            .withCopyToContainer(Transferable.of("""
                    metadata_dir = "/var/lib/garage/meta"
                    data_dir = "/var/lib/garage/data"
                    db_engine = "sqlite"
                    replication_factor = 1
                    rpc_bind_addr = "[::]:3901"
                    rpc_public_addr = "127.0.0.1:3901"
                    rpc_secret = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
                    [s3_api]
                    s3_region = "garage"
                    api_bind_addr = "[::]:3900"
                    """), "/etc/garage.toml")
            .withExposedPorts(3900)
            .waitingFor(Wait.forListeningPort());

    static StorageService storage;

    @BeforeAll
    static void startGarage() throws Exception {
        GARAGE.start();
        String status = "";
        // the node writes its key a moment after the port opens; until then the CLI fails
        for (int i = 0; i < 60 && !status.contains("NO ROLE ASSIGNED"); i++) {
            try {
                status = garage("status");
            } catch (IllegalStateException notYet) {
                status = notYet.getMessage();
            }
            if (!status.contains("NO ROLE ASSIGNED")) Thread.sleep(500);
        }
        String lastStatus = status;
        String node = status.lines().filter(l -> l.contains("NO ROLE ASSIGNED")).findFirst()
                .orElseThrow(() -> new IllegalStateException("Garage node did not come up: " + lastStatus))
                .trim().split("\\s+")[0];
        garage("layout", "assign", "-z", "dc1", "-c", "1G", node);
        garage("layout", "apply", "--version", "1");
        garage("bucket", "create", BUCKET);
        garage("key", "import", "--yes", "-n", "love-site", KEY_ID, SECRET);
        garage("bucket", "allow", "--read", "--write", "--owner", BUCKET, "--key", "love-site");

        storage = new StorageService(new StorageProperties(endpoint(), BUCKET, KEY_ID, SECRET, "garage", true, true,
                List.of(ORIGIN), null, null, 0));
    }

    @AfterAll
    static void stopGarage() {
        GARAGE.stop();
    }

    static String garage(String... args) throws Exception {
        String[] command = new String[args.length + 1];
        command[0] = "/garage";
        System.arraycopy(args, 0, command, 1, args.length);
        var result = GARAGE.execInContainer(command);
        if (result.getExitCode() != 0) throw new IllegalStateException(String.join(" ", args) + ": " + result.getStderr());
        return result.getStdout();
    }

    static String endpoint() {
        return "http://" + GARAGE.getHost() + ":" + GARAGE.getMappedPort(3900);
    }

    @Test
    void theBrowsersUploadPreflightIsAllowed() throws Exception {
        storage.putBucketCors(List.of(ORIGIN));
        String put = storage.presignPut("spaces/s/albums/a/media/m/original", "image/jpeg", java.time.Duration.ofMinutes(5));

        // what a browser sends before the PUT: header names in lower case
        HttpResponse<Void> preflight = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(put))
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .header("Origin", ORIGIN)
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "content-type")
                .build(), HttpResponse.BodyHandlers.discarding());

        assertThat(preflight.statusCode()).isEqualTo(200);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin")).hasValue(ORIGIN);

        HttpResponse<Void> upload = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(put))
                .PUT(HttpRequest.BodyPublishers.ofByteArray(new byte[]{1, 2, 3}))
                .header("Origin", ORIGIN)
                .header("Content-Type", "image/jpeg")
                .build(), HttpResponse.BodyHandlers.discarding());
        assertThat(upload.statusCode()).isEqualTo(200);
        // the browser only hands the response (and the ETag the upload reads) to the page with these
        assertThat(upload.headers().firstValue("Access-Control-Allow-Origin")).hasValue(ORIGIN);
        assertThat(upload.headers().firstValue("Access-Control-Expose-Headers").orElse("")).containsIgnoringCase("etag");
    }
}

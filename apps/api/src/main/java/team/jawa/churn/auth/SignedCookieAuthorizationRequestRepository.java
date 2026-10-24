package team.jawa.churn.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;

public class SignedCookieAuthorizationRequestRepository
        implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    static final String COOKIE = "churn_oidc";

    private static final String PATH = "/api/v1/auth/oidc";
    private static final Duration LIFETIME = Duration.ofMinutes(5);

    private final SecretKey key;
    private final boolean secure;

    public SignedCookieAuthorizationRequestRepository(SecretKey key, boolean secure) {
        this.key = key;
        this.secure = secure;
    }

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE.equals(cookie.getName())) {
                return decode(cookie.getValue());
            }
        }
        return null;
    }

    @Override
    public void saveAuthorizationRequest(
            OAuth2AuthorizationRequest authorizationRequest, HttpServletRequest request, HttpServletResponse response) {
        if (authorizationRequest == null) {
            clear(response);
            return;
        }
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                cookie(encode(authorizationRequest), LIFETIME).toString());
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(
            HttpServletRequest request, HttpServletResponse response) {
        OAuth2AuthorizationRequest loaded = loadAuthorizationRequest(request);
        clear(response);
        return loaded;
    }

    private void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(COOKIE, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path(PATH)
                .maxAge(maxAge)
                .build();
    }

    private String encode(OAuth2AuthorizationRequest authorizationRequest) {
        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(authorizationRequest);
            out.flush();
            byte[] payload = bytes.toByteArray();
            Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
            return encoder.encodeToString(payload) + "." + encoder.encodeToString(sign(payload));
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private OAuth2AuthorizationRequest decode(String value) {
        int separator = value.indexOf('.');
        if (separator < 0) {
            return null;
        }
        try {
            Base64.Decoder decoder = Base64.getUrlDecoder();
            byte[] payload = decoder.decode(value.substring(0, separator));
            byte[] signature = decoder.decode(value.substring(separator + 1));
            if (!MessageDigest.isEqual(signature, sign(payload))) {
                return null;
            }
            try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(payload))) {
                return (OAuth2AuthorizationRequest) in.readObject();
            }
        } catch (IllegalArgumentException | IOException | ClassNotFoundException | ClassCastException e) {
            return null;
        }
    }

    private byte[] sign(byte[] payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(key);
            return mac.doFinal(payload);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}

package team.jawa.churn.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private static final String ROLE = "role";
    private static final String PROVIDER = "prov";
    private static final String DELEGATED_AUDIENCE = "mcp";

    private final JwtEncoder encoder;
    private final JwtDecoder decoder;
    private final AuthProperties properties;

    JwtService(JwtEncoder encoder, JwtDecoder decoder, AuthProperties properties) {
        this.encoder = encoder;
        this.decoder = decoder;
        this.properties = properties;
    }

    public String issue(UserAccount user) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(Long.toString(user.id()))
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTtl()))
                .claim(ROLE, user.role())
                .claim(PROVIDER, user.authProvider())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public String issueDelegated(AuthenticatedUser user, Duration ttl) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(Long.toString(user.id()))
                .audience(List.of(DELEGATED_AUDIENCE))
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .claim(ROLE, user.role())
                .claim(PROVIDER, user.provider())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    public Optional<AuthenticatedUser> parse(String token) {
        return decode(token).filter(jwt -> !delegated(jwt)).map(JwtService::user);
    }

    public Optional<AuthenticatedUser> parseDelegated(String token) {
        return decode(token).filter(JwtService::delegated).map(JwtService::user);
    }

    private Optional<Jwt> decode(String token) {
        try {
            Jwt jwt = decoder.decode(token);
            Long.parseLong(jwt.getSubject());
            return Optional.of(jwt);
        } catch (JwtException | NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static boolean delegated(Jwt jwt) {
        List<String> audience = jwt.getAudience();
        return audience != null && audience.contains(DELEGATED_AUDIENCE);
    }

    private static AuthenticatedUser user(Jwt jwt) {
        return new AuthenticatedUser(
                Long.parseLong(jwt.getSubject()), jwt.getClaimAsString(ROLE), jwt.getClaimAsString(PROVIDER));
    }
}

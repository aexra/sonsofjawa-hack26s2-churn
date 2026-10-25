package team.jawa.churn.web;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.UsersApi;
import team.jawa.churn.api.generated.model.Role;
import team.jawa.churn.api.generated.model.User;
import team.jawa.churn.api.generated.model.UserCreate;
import team.jawa.churn.api.generated.model.UserPatch;
import team.jawa.churn.auth.AuthenticatedUser;
import team.jawa.churn.auth.UserAccount;
import team.jawa.churn.auth.UserService;

@RestController
class UsersController implements UsersApi {

    private final UserService users;

    UsersController(UserService users) {
        this.users = users;
    }

    @Override
    public ResponseEntity<List<User>> listUsers() {
        return ResponseEntity.ok(
                users.list().stream().map(UsersController::toUser).toList());
    }

    @Override
    public ResponseEntity<User> createUser(UserCreate request) {
        UserAccount created = users.create(
                request.getLogin(),
                request.getPassword(),
                request.getRole().getValue(),
                request.getEmail(),
                request.getDisplayName(),
                Long.toString(actorId()));
        return ResponseEntity.status(HttpStatus.CREATED).body(toUser(created));
    }

    @Override
    public ResponseEntity<User> updateUser(Long id, UserPatch request) {
        UserService.Patch patch = new UserService.Patch(
                request.getRole() == null ? null : request.getRole().getValue(),
                request.getEnabled(),
                request.getDisplayName(),
                request.getEmail(),
                request.getPassword());
        return ResponseEntity.ok(toUser(users.update(id, patch, actorId())));
    }

    @Override
    public ResponseEntity<Void> deleteUser(Long id) {
        users.delete(id, actorId());
        return ResponseEntity.noContent().build();
    }

    private static long actorId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user.id();
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
    }

    private static User toUser(UserAccount user) {
        return new User(
                        user.id(),
                        user.login(),
                        Role.fromValue(user.role()),
                        User.AuthProviderEnum.fromValue(user.authProvider()),
                        user.enabled(),
                        user.createdAt())
                .email(user.email())
                .displayName(user.displayName())
                .lastLoginAt(user.lastLoginAt());
    }
}

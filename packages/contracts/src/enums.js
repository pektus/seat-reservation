export var UserRole;
(function (UserRole) {
    UserRole["SYSTEM_ADMIN"] = "SYSTEM_ADMIN";
    UserRole["BUILDING_MANAGER"] = "BUILDING_MANAGER";
    UserRole["EMPLOYEE"] = "EMPLOYEE";
})(UserRole || (UserRole = {}));
export var ReservationStatus;
(function (ReservationStatus) {
    ReservationStatus["CONFIRMED"] = "CONFIRMED";
    ReservationStatus["CANCELLED"] = "CANCELLED";
})(ReservationStatus || (ReservationStatus = {}));
export var DeskType;
(function (DeskType) {
    DeskType["STANDARD"] = "STANDARD";
    DeskType["STANDING"] = "STANDING";
    DeskType["QUIET"] = "QUIET";
    DeskType["COLLABORATIVE"] = "COLLABORATIVE";
    DeskType["ACCESSIBLE"] = "ACCESSIBLE";
})(DeskType || (DeskType = {}));
export var DeskAvailabilityStatus;
(function (DeskAvailabilityStatus) {
    DeskAvailabilityStatus["AVAILABLE"] = "AVAILABLE";
    DeskAvailabilityStatus["RESERVED"] = "RESERVED";
    DeskAvailabilityStatus["RESERVED_BY_ME"] = "RESERVED_BY_ME";
    DeskAvailabilityStatus["UNDER_REVIEW"] = "UNDER_REVIEW";
    DeskAvailabilityStatus["MAINTENANCE"] = "MAINTENANCE";
})(DeskAvailabilityStatus || (DeskAvailabilityStatus = {}));
export var AuthProviderType;
(function (AuthProviderType) {
    AuthProviderType["LOCAL"] = "LOCAL";
    AuthProviderType["OIDC"] = "OIDC";
    AuthProviderType["SAML"] = "SAML";
})(AuthProviderType || (AuthProviderType = {}));
//# sourceMappingURL=enums.js.map
import {
  adminAchievementCreateRequestSchema,
  adminCatalogTitleUpdateRequestSchema,
  adminChallengeUpdateRequestSchema,
  adminMapMetadataUpdateRequestSchema,
  adminMapRevisionCreateRequestSchema,
  adminMapRevisionPromotionRequestSchema,
  adminMapRevisionUpdateRequestSchema,
  adminMapTitleRuleCreateRequestSchema,
  adminMapTitleRuleExceptionUpsertRequestSchema,
  adminMapTitleRuleUpdateRequestSchema,
  adminRandomEventCreateRequestSchema,
  adminRandomEventImportRequestSchema,
  adminRandomEventUpdateRequestSchema,
  adminRandomEventVersionAvailabilityRequestSchema,
} from "@owbastion/contracts";
import { maintainerRoute, parseBody, type AdminRouteDependencies, type ApiApp } from "./route-contract";

type ServiceOperation = (context: any, operation: string, action: () => Promise<any>) => Promise<any>;

export const registerAdminCatalogRoutes = (app: ApiApp, dependencies: AdminRouteDependencies, logServiceOperation: ServiceOperation) => {
  const { requireMaintainer, errorResponse, errorGroup, adminMutation } = dependencies;

  app.get("/v1/admin/achievements", maintainerRoute(requireMaintainer, async (c, auth) => {
    const type = c.req.query("type");
    const status = c.req.query("status");
    const family = type === "map_completion" || type === "map" ? "map" : type === "title_achievement" || type === "achievement" ? "achievement" : undefined;
    if (type && !family) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement type is invalid");
    if (status && !["draft", "scheduled", "active", "sunsetting", "retired"].includes(status)) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement status is invalid");
    return c.json(await logServiceOperation(c, "admin_list_achievements", () => dependencies.services(c.env).listAdminChallenges({ family: family as "map" | "achievement" | undefined, status }, auth)));
  }));

  app.post("/v1/admin/achievements", async (c) => {
    return adminMutation(c, {
      schema: adminAchievementCreateRequestSchema,
      status: 201,
      action: (input, auth, key) => dependencies.services(c.env).createAdminAchievement(input, auth, key),
      errors: {
        ...errorGroup(409, "The title key already exists", "TITLE_KEY_CONFLICT"),
        ...errorGroup(422, "One or more target maps are unavailable", "MAP_NOT_FOUND", "MAP_NOT_ACTIVE"),
        ...errorGroup(422, "Active, sunsetting, and retired challenges require a game version", "ACHIEVEMENT_GAME_VERSION_REQUIRED"),
        ...errorGroup(422, "A developer-retained title cannot become a player challenge", "DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE"),
      },
    });
  });

  app.get("/v1/admin/maps", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_maps", () => dependencies.services(c.env).listMaps()) });
  }));

  app.get("/v1/admin/map-title-rules", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json(await dependencies.services(c.env).listAdminMapTitleRules(auth));
  }));
  app.post("/v1/admin/map-title-rules", async (c) => {
    return adminMutation(c, {
      schema: adminMapTitleRuleCreateRequestSchema,
      status: 201,
      action: (input, auth, key) => dependencies.services(c.env).createAdminMapTitleRule(input, auth, key),
      errors: {
        ...errorGroup(422, "The map title is unavailable", "MAP_TITLE_NOT_FOUND"),
        ...errorGroup(422, "Pioneer rules can only use explicit map exceptions", "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT"),
        ...errorGroup(409, "The map title rule conflicts with an existing record", "MAP_TITLE_RULE_KIND_CONFLICT", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });
  app.put("/v1/admin/map-title-rules/:ruleId", async (c) => {
    return adminMutation(c, {
      schema: adminMapTitleRuleUpdateRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).updateAdminMapTitleRule({ ...input, ruleId: c.req.param("ruleId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map title rule does not exist", "MAP_TITLE_RULE_NOT_FOUND"),
        ...errorGroup(422, "The map title is unavailable", "MAP_TITLE_NOT_FOUND"),
        ...errorGroup(422, "Pioneer rules can only use explicit map exceptions", "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT"),
        ...errorGroup(409, "The map title rule conflicts with an existing record", "MAP_TITLE_RULE_KIND_CONFLICT", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });
  app.get("/v1/admin/maps/:mapId/map-title-inheritance", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await dependencies.services(c.env).listAdminMapTitleInheritance({ mapId: c.req.param("mapId")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "MAP_NOT_FOUND") return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist"); throw error; }
  }));
  app.put("/v1/admin/maps/:mapId/map-title-rules/:ruleId/exception", async (c) => {
    return adminMutation(c, {
      schema: adminMapTitleRuleExceptionUpsertRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).upsertAdminMapTitleRuleException({ ...input, mapId: c.req.param("mapId"), ruleId: c.req.param("ruleId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map or map title rule does not exist", "MAP_NOT_FOUND", "MAP_TITLE_RULE_NOT_FOUND"),
        ...errorGroup(422, "Pioneer map exceptions require a valid start and end time", "PIONEER_EXCEPTION_SCHEDULE_REQUIRED"),
      },
    });
  });

  app.get("/v1/admin/titles", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_titles", () => dependencies.services(c.env).listTitles({ mapId: c.req.query("mapId")?.trim() || undefined })) });
  }));

  app.get("/v1/admin/events", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({
      contractVersion: "1",
      items: await logServiceOperation(c, "admin_list_events", () => dependencies.services(c.env).listRandomEvents({
        query: c.req.query("query")?.trim() || undefined,
        category: c.req.query("category")?.trim() || undefined,
        rarity: c.req.query("rarity")?.trim() || undefined,
        includeArchived: c.req.query("archived") === "true",
      })),
    });
  }));
  app.post("/v1/admin/events", (c) => adminMutation(c, {
    schema: adminRandomEventCreateRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c.env).createAdminRandomEvent(input, auth, key),
    errors: {
      ...errorGroup(422, "The challenge does not exist", "CHALLENGE_NOT_FOUND"),
    },
  }));
  app.put("/v1/admin/events/:eventId", (c) => adminMutation(c, {
    schema: adminRandomEventUpdateRequestSchema,
    action: (input, auth, key) => dependencies.services(c.env).updateAdminRandomEvent({ ...input, eventId: c.req.param("eventId") }, auth, key),
    errors: {
      ...errorGroup(404, "The event does not exist", "EVENT_NOT_FOUND"),
      ...errorGroup(422, "The challenge does not exist", "CHALLENGE_NOT_FOUND"),
    },
  }));
  app.delete("/v1/admin/events/:eventId", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => dependencies.services(c.env).archiveAdminRandomEvent({ eventId: c.req.param("eventId") }, auth, key),
    errors: {
      ...errorGroup(404, "The event does not exist", "EVENT_NOT_FOUND"),
    },
  }));
  app.post("/v1/admin/events/imports/preview", maintainerRoute(requireMaintainer, async (c, auth) => { const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); return c.json(await dependencies.services(c.env).previewAdminRandomEventImport(parsed.data, auth)); }));
  app.post("/v1/admin/events/imports", (c) => adminMutation(c, {
    schema: adminRandomEventImportRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c.env).importAdminRandomEvents(input, auth, key),
    errors: {
      ...errorGroup(422, "The import data is invalid", "EVENT_IMPORT_INVALID", "EVENT_IMPORT_NAME_CONFLICT", "CHALLENGE_NOT_FOUND"),
      ...errorGroup(409, "The import was already processed", "EVENT_IMPORT_DUPLICATE", "IDEMPOTENCY_CONFLICT"),
    },
  }));
  app.get("/v1/admin/event-versions", maintainerRoute(requireMaintainer, async (c, auth) => { return c.json(await logServiceOperation(c, "admin_list_event_versions", () => dependencies.services(c.env).listAdminRandomEventVersions(auth))); }));
  app.put("/v1/admin/event-versions/:gameVersion/availability", (c) => adminMutation(c, {
    schema: adminRandomEventVersionAvailabilityRequestSchema,
    action: (input, auth, key) => dependencies.services(c.env).updateAdminRandomEventVersion({ ...input, gameVersion: decodeURIComponent(c.req.param("gameVersion")) }, auth, key),
    errors: {
      ...errorGroup(404, "The event version does not exist", "EVENT_VERSION_NOT_FOUND"),
    },
  }));

  app.get("/v1/admin/maps/:mapId/editor", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await logServiceOperation(c, "admin_get_map_editor", () => dependencies.services(c.env).getAdminMapEditor({ mapId: c.req.param("mapId")! }, auth))); }
    catch (error) {
      const code = error instanceof Error ? error.message : "MAP_EDITOR_READ_FAILED";
      if (code === "MAP_NOT_FOUND") return errorResponse(c, 404, code, "The map does not exist");
      if (["INVALID_REVISION_LIFECYCLE", "INVALID_MAP_VARIANT", "INVALID_REVISION_ASSIGNMENT", "INVALID_SPATIAL_CONFIG"].includes(code)) return errorResponse(c, 422, code, "The map revision data is invalid");
      throw error;
    }
  }));
  app.post("/v1/admin/maps/:mapId/revisions", async (c) => {
    return adminMutation(c, {
      schema: adminMapRevisionCreateRequestSchema,
      status: 201,
      action: (input, auth, key) => dependencies.services(c.env).createAdminMapRevision({ ...input, mapId: c.req.param("mapId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map does not exist", "MAP_NOT_FOUND"),
        ...errorGroup(422, "The source revision does not belong to this map", "REVISION_SOURCE_NOT_FOUND"),
        ...errorGroup(422, "The revision configuration is invalid", "INVALID_SPATIAL_CONFIG", "INVALID_REVISION_ASSIGNMENT", "DUPLICATE_REVISION_ASSIGNMENT", "REVISION_CHALLENGE_NOT_FOUND", "REVISION_CHALLENGE_NOT_ACTIVE", "REVISION_CHALLENGE_NOT_ASSIGNABLE"),
        ...errorGroup(409, "The revision conflicts with an existing record", "IDEMPOTENCY_CONFLICT", "LEGACY_VARIANT_CONFLICT"),
      },
    });
  });
  app.put("/v1/admin/maps/:mapId/revisions/:revisionId", async (c) => {
    return adminMutation(c, {
      schema: adminMapRevisionUpdateRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).updateAdminMapRevision({ ...input, mapId: c.req.param("mapId"), revisionId: c.req.param("revisionId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map revision does not exist", "REVISION_NOT_FOUND"),
        ...errorGroup(409, "Changing the default Revision requires the explicit promotion operation", "REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION"),
        ...errorGroup(422, "The revision configuration is invalid", "INVALID_REVISION_TRANSITION", "DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT", "INVALID_SPATIAL_CONFIG", "INVALID_REVISION_ASSIGNMENT", "DUPLICATE_REVISION_ASSIGNMENT", "REVISION_CHALLENGE_NOT_FOUND", "REVISION_CHALLENGE_NOT_ACTIVE", "REVISION_CHALLENGE_NOT_ASSIGNABLE"),
        ...errorGroup(409, "The revision conflicts with an existing record", "LEGACY_VARIANT_CONFLICT", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });

  app.post("/v1/admin/maps/:mapId/revisions/:revisionId/promote", async (c) => {
    return adminMutation(c, {
      schema: adminMapRevisionPromotionRequestSchema,
      invalidMessage: "The promotion request does not match contract v1",
      action: (input, auth, key) => dependencies.services(c.env).promoteAdminMapRevision({ ...input, mapId: c.req.param("mapId"), revisionId: c.req.param("revisionId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map does not exist", "MAP_NOT_FOUND"),
        ...errorGroup(404, "The Revision does not exist", "REVISION_NOT_FOUND"),
        ...errorGroup(409, "The Revision is not available for promotion", "REVISION_NOT_PROMOTABLE"),
        ...errorGroup(422, "Choose how the previous default Revision should remain available", "DEFAULT_REVISION_REPLACEMENT_REQUIRED"),
        ...errorGroup(422, "There is no current default Revision to replace", "DEFAULT_REVISION_REPLACEMENT_NOT_FOUND"),
        ...errorGroup(422, "The Revision is not ready for promotion", "DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT", "INVALID_SPATIAL_CONFIG", "REVISION_CHALLENGE_NOT_FOUND", "REVISION_CHALLENGE_NOT_ACTIVE", "REVISION_CHALLENGE_NOT_ASSIGNABLE"),
      },
    });
  });

  app.put("/v1/admin/maps/:mapId/metadata", async (c) => {
    return adminMutation(c, {
      schema: adminMapMetadataUpdateRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).updateAdminMapMetadata({ ...input, mapId: c.req.param("mapId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map does not exist", "MAP_NOT_FOUND"),
      },
    });
  });

  app.put("/v1/admin/titles/:titleKey", async (c) => {
    return adminMutation(c, {
      schema: adminCatalogTitleUpdateRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).updateAdminCatalogTitle({ ...input, titleKey: c.req.param("titleKey") }, auth, key),
      errors: {
        ...errorGroup(404, "The title does not exist", "TITLE_NOT_FOUND"),
        ...errorGroup(409, "The title has a challenge record", "TITLE_HAS_CHALLENGE"),
        ...errorGroup(422, "A developer-retained title cannot become a player challenge", "DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE"),
      },
    });
  });

  app.post("/v1/admin/titles/:titleKey/icon", maintainerRoute(requireMaintainer, async (c, auth) => {
    try {
      const form = await c.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return errorResponse(c, 422, "ICON_FILE_REQUIRED", "An icon file is required");
      const result = await dependencies.services(c.env).uploadAdminTitleIcon({ titleKey: c.req.param("titleKey")!, body: await file.arrayBuffer(), contentType: file.type }, auth);
      return c.json({ contractVersion: "1", ...result });
    } catch (error) {
      const code = error instanceof Error ? error.message : "ICON_UPLOAD_FAILED";
      if (code === "TITLE_NOT_FOUND") return errorResponse(c, 404, code, "The title does not exist");
      if (code === "ICON_FILE_INVALID") return errorResponse(c, 422, code, "仅支持 PNG、JPG、WebP，且文件不能超过 512 KB。");
      if (code === "ICON_BUCKET_UNAVAILABLE") return errorResponse(c, 503, code, "图标存储暂不可用");
      throw error;
    }
  }));

  app.put("/v1/admin/achievements/:challengeId", async (c) => {
    return adminMutation(c, {
      schema: adminChallengeUpdateRequestSchema,
      prepare: (body) => {
        const input = body as Record<string, unknown> | null;
        return { ...input, family: input?.family ?? (c.req.param("challengeId").startsWith("title.") ? "achievement" : "map") };
      },
      action: (input, auth, key) => dependencies.services(c.env).updateAdminChallenge({ ...input, challengeId: c.req.param("challengeId") }, auth, key),
      errors: {
        ...errorGroup(404, "The achievement does not exist", "CHALLENGE_NOT_FOUND"),
        ...errorGroup(422, "The challenge lifecycle metadata is invalid", "MAP_NOT_FOUND", "MAP_NOT_ACTIVE", "INVALID_MAP_SCOPE", "ACHIEVEMENT_GAME_VERSION_REQUIRED"),
      },
    });
  });

};

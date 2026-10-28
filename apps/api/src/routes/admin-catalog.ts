import {
  adminTitleCreateRequestSchema,
  adminTitleChallengeCreateRequestSchema,
  adminChallengeLifecycleRequestSchema,
  adminCatalogTitleUpdateRequestSchema,
  adminChallengeUpdateRequestSchema,
  adminMapCreateRequestSchema,
  adminMapMetadataUpdateRequestSchema,
  adminMapRevisionCreateRequestSchema,
  adminMapRevisionPromotionRequestSchema,
  adminMapRevisionUpdateRequestSchema,
  adminMapTitleRuleCreateRequestSchema,
  adminMapTitleRuleExceptionUpsertRequestSchema,
  adminMapTitleRuleUpdateRequestSchema,
  adminRandomEventBatchRequestSchema,
  adminRandomEventCreateRequestSchema,
  adminRandomEventImportRequestSchema,
  adminRandomEventUpdateRequestSchema,
  adminRandomEventVersionAvailabilityRequestSchema,
  adminStandaloneModeUpsertRequestSchema,
} from "@owbastion/contracts";
import { maintainerRoute, parseBody, type AdminRouteDependencies, type ApiApp } from "./route-contract";

const TITLE_IMAGE_PREFIX = "achievements/";
type AssetsEnv = { ASSETS_BUCKET?: R2Bucket; ASSETS_PUBLIC_ORIGIN?: string };

type ServiceOperation = (context: any, operation: string, action: () => Promise<any>) => Promise<any>;

export const registerAdminCatalogRoutes = (app: ApiApp, dependencies: AdminRouteDependencies, logServiceOperation: ServiceOperation) => {
  const { requireMaintainer, errorResponse, errorGroup, adminMutation } = dependencies;

  app.get("/v1/admin/achievements", maintainerRoute(requireMaintainer, async (c, auth) => {
    const type = c.req.query("type");
    const status = c.req.query("status");
    const family = type === "map_completion" || type === "map" ? "map" : type === "title_achievement" || type === "achievement" ? "achievement" : undefined;
    if (type && !family) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement type is invalid");
    if (status && !["draft", "active", "archived"].includes(status)) return errorResponse(c, 422, "INVALID_REQUEST", "The achievement status is invalid");
    return c.json(await logServiceOperation(c, "admin_list_achievements", () => dependencies.services(c).listAdminChallenges({ family: family as "map" | "achievement" | undefined, status }, auth)));
  }));

  app.get("/v1/admin/title-summaries", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await dependencies.services(c).listAdminTitleSummaries(auth))));
  app.post("/v1/admin/titles", (c) => adminMutation(c, {
    schema: adminTitleCreateRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c).createAdminTitle(input, auth, key),
    errors: errorGroup(409, "The title key already exists", "TITLE_KEY_CONFLICT"),
  }));
  app.get("/v1/admin/titles/:titleKey/challenges", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await dependencies.services(c).listAdminTitleChallenges({ titleKey: c.req.param("titleKey")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "TITLE_NOT_FOUND") return errorResponse(c, 404, "TITLE_NOT_FOUND", "The title does not exist"); throw error; }
  }));
  app.post("/v1/admin/titles/:titleKey/challenges", (c) => adminMutation(c, {
    schema: adminTitleChallengeCreateRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c).createAdminTitleChallenge({ ...input, titleKey: c.req.param("titleKey") }, auth, key),
    errors: {
      ...errorGroup(404, "The title does not exist", "TITLE_NOT_FOUND"),
      ...errorGroup(409, "The title cannot accept challenges", "TITLE_MANAGED_BY_MAP_RULE"),
      ...errorGroup(422, "The challenge scope, rule, window or version is invalid", "MAP_NOT_FOUND", "MAP_NOT_ACTIVE", "INVALID_MAP_SCOPE", "INVALID_SUBMISSION_MODE", "ACHIEVEMENT_GAME_VERSION_REQUIRED", "INVALID_CHALLENGE_WINDOW", "STANDALONE_MODE_NOT_FOUND"),
    },
  }));
  app.put("/v1/admin/achievements/:challengeId/lifecycle", (c) => adminMutation(c, {
    schema: adminChallengeLifecycleRequestSchema,
    action: (input, auth, key) => dependencies.services(c).updateAdminChallengeLifecycle({ ...input, challengeId: c.req.param("challengeId") }, auth, key),
    errors: {
      ...errorGroup(404, "The challenge does not exist", "CHALLENGE_NOT_FOUND"),
      ...errorGroup(422, "The challenge window or version is invalid", "INVALID_CHALLENGE_WINDOW", "ACHIEVEMENT_GAME_VERSION_REQUIRED"),
    },
  }));

  app.post("/v1/admin/maps", (c) => adminMutation(c, {
    schema: adminMapCreateRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c).createAdminMap(input, auth, key),
    errors: {
      ...errorGroup(409, "The map conflicts with an existing record", "MAP_NAME_CONFLICT", "MAP_ID_CONFLICT"),
    },
  }));

  app.get("/v1/admin/maps", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_maps", () => dependencies.services(c).listMaps()) });
  }));

  app.get("/v1/admin/map-title-rules", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json(await dependencies.services(c).listAdminMapTitleRules(auth));
  }));
  app.post("/v1/admin/map-title-rules", async (c) => {
    return adminMutation(c, {
      schema: adminMapTitleRuleCreateRequestSchema,
      status: 201,
      action: (input, auth, key) => dependencies.services(c).createAdminMapTitleRule(input, auth, key),
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
      action: (input, auth, key) => dependencies.services(c).updateAdminMapTitleRule({ ...input, ruleId: c.req.param("ruleId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map title rule does not exist", "MAP_TITLE_RULE_NOT_FOUND"),
        ...errorGroup(422, "The map title is unavailable", "MAP_TITLE_NOT_FOUND"),
        ...errorGroup(422, "Pioneer rules can only use explicit map exceptions", "PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT"),
        ...errorGroup(409, "The map title rule conflicts with an existing record", "MAP_TITLE_RULE_KIND_CONFLICT", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });
  app.get("/v1/admin/maps/:mapId/map-title-inheritance", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await dependencies.services(c).listAdminMapTitleInheritance({ mapId: c.req.param("mapId")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "MAP_NOT_FOUND") return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist"); throw error; }
  }));
  app.put("/v1/admin/maps/:mapId/map-title-rules/:ruleId/exception", async (c) => {
    return adminMutation(c, {
      schema: adminMapTitleRuleExceptionUpsertRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c).upsertAdminMapTitleRuleException({ ...input, mapId: c.req.param("mapId"), ruleId: c.req.param("ruleId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map or map title rule does not exist", "MAP_NOT_FOUND", "MAP_TITLE_RULE_NOT_FOUND"),
        ...errorGroup(422, "Pioneer map exceptions require a valid start and end time", "PIONEER_EXCEPTION_SCHEDULE_REQUIRED"),
      },
    });
  });

  app.get("/v1/admin/titles", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "admin_list_titles", () => dependencies.services(c).listTitles({ mapId: c.req.query("mapId")?.trim() || undefined })) });
  }));

  app.get("/v1/admin/title-images", maintainerRoute(requireMaintainer, async (c) => {
    const { ASSETS_BUCKET: bucket, ASSETS_PUBLIC_ORIGIN } = c.env as AssetsEnv;
    const origin = ASSETS_PUBLIC_ORIGIN?.replace(/\/+$/, "");
    if (!bucket || !origin) return errorResponse(c, 503, "ASSETS_BUCKET_UNAVAILABLE", "图片存储暂不可用");
    const items: Array<{ name: string; url: string }> = [];
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: TITLE_IMAGE_PREFIX, cursor });
      for (const object of page.objects) {
        const name = object.key.slice(TITLE_IMAGE_PREFIX.length);
        if (/^[^/]+\.(png|webp)$/i.test(name)) items.push({ name, url: `${origin}/${object.key}` });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return c.json({ contractVersion: "1", items });
  }));

  app.get("/v1/admin/events", maintainerRoute(requireMaintainer, async (c, auth) => {
    return c.json({
      contractVersion: "1",
      items: await logServiceOperation(c, "admin_list_events", () => dependencies.services(c).listRandomEvents({
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
    action: (input, auth, key) => dependencies.services(c).createAdminRandomEvent(input, auth, key),
    errors: {
      ...errorGroup(422, "The challenge does not exist", "CHALLENGE_NOT_FOUND"),
      ...errorGroup(422, "The event outcomes are invalid", "EVENT_OUTCOMES_INVALID"),
    },
  }));
  app.post("/v1/admin/events/batch", (c) => adminMutation(c, {
    schema: adminRandomEventBatchRequestSchema,
    action: async (input, auth, key) => ({ contractVersion: "1" as const, items: await dependencies.services(c).batchUpdateAdminRandomEvents(input, auth, key) }),
    errors: {
      ...errorGroup(404, "An event in the batch does not exist", "EVENT_NOT_FOUND"),
      ...errorGroup(422, "The event outcomes are invalid", "EVENT_OUTCOMES_INVALID"),
    },
  }));
  app.put("/v1/admin/events/:eventId", (c) => adminMutation(c, {
    schema: adminRandomEventUpdateRequestSchema,
    action: (input, auth, key) => dependencies.services(c).updateAdminRandomEvent({ ...input, eventId: c.req.param("eventId") }, auth, key),
    errors: {
      ...errorGroup(404, "The event does not exist", "EVENT_NOT_FOUND"),
      ...errorGroup(422, "The challenge does not exist", "CHALLENGE_NOT_FOUND"),
      ...errorGroup(422, "The event outcomes are invalid", "EVENT_OUTCOMES_INVALID"),
    },
  }));
  app.delete("/v1/admin/events/:eventId", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => dependencies.services(c).archiveAdminRandomEvent({ eventId: c.req.param("eventId") }, auth, key),
    errors: {
      ...errorGroup(404, "The event does not exist", "EVENT_NOT_FOUND"),
    },
  }));
  app.post("/v1/admin/events/imports/preview", maintainerRoute(requireMaintainer, async (c, auth) => { const parsed = adminRandomEventImportRequestSchema.safeParse(await parseBody(c.req.raw)); if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1"); return c.json(await dependencies.services(c).previewAdminRandomEventImport(parsed.data, auth)); }));
  app.post("/v1/admin/events/imports", (c) => adminMutation(c, {
    schema: adminRandomEventImportRequestSchema,
    status: 201,
    action: (input, auth, key) => dependencies.services(c).importAdminRandomEvents(input, auth, key),
    errors: {
      ...errorGroup(422, "The import data is invalid", "EVENT_IMPORT_INVALID", "EVENT_IMPORT_NAME_CONFLICT", "CHALLENGE_NOT_FOUND"),
      ...errorGroup(409, "The import was already processed", "EVENT_IMPORT_DUPLICATE", "IDEMPOTENCY_CONFLICT"),
    },
  }));
  app.get("/v1/admin/event-versions", maintainerRoute(requireMaintainer, async (c, auth) => { return c.json(await logServiceOperation(c, "admin_list_event_versions", () => dependencies.services(c).listAdminRandomEventVersions(auth))); }));
  app.put("/v1/admin/event-versions/:gameVersion/availability", (c) => adminMutation(c, {
    schema: adminRandomEventVersionAvailabilityRequestSchema,
    action: (input, auth, key) => dependencies.services(c).updateAdminRandomEventVersion({ ...input, gameVersion: decodeURIComponent(c.req.param("gameVersion")) }, auth, key),
    errors: {
      ...errorGroup(404, "The event version does not exist", "EVENT_VERSION_NOT_FOUND"),
    },
  }));

  app.get("/v1/admin/standalone-modes", maintainerRoute(requireMaintainer, async (c, auth) => { return c.json(await logServiceOperation(c, "admin_list_standalone_modes", () => dependencies.services(c).listAdminStandaloneModes(auth))); }));
  app.put("/v1/admin/standalone-modes/:mode", (c) => adminMutation(c, {
    schema: adminStandaloneModeUpsertRequestSchema,
    action: (input, auth, key) => dependencies.services(c).upsertAdminStandaloneMode({ ...input, mode: decodeURIComponent(c.req.param("mode")) }, auth, key),
    errors: {
      ...errorGroup(422, "A standalone mode needs a non-regular mode name", "STANDALONE_MODE_INVALID"),
      ...errorGroup(422, "One or more maps or event pools are unavailable", "MAP_NOT_FOUND", "MAP_NOT_ACTIVE", "EVENT_VERSION_NOT_FOUND"),
      ...errorGroup(409, "An event pool already belongs to another standalone mode", "STANDALONE_MODE_POOL_CONFLICT"),
    },
  }));

  app.get("/v1/admin/maps/:mapId/editor", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await logServiceOperation(c, "admin_get_map_editor", () => dependencies.services(c).getAdminMapEditor({ mapId: c.req.param("mapId")! }, auth))); }
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
      action: (input, auth, key) => dependencies.services(c).createAdminMapRevision({ ...input, mapId: c.req.param("mapId") }, auth, key),
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
      action: (input, auth, key) => dependencies.services(c).updateAdminMapRevision({ ...input, mapId: c.req.param("mapId"), revisionId: c.req.param("revisionId") }, auth, key),
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
      action: (input, auth, key) => dependencies.services(c).promoteAdminMapRevision({ ...input, mapId: c.req.param("mapId"), revisionId: c.req.param("revisionId") }, auth, key),
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
      action: (input, auth, key) => dependencies.services(c).updateAdminMapMetadata({ ...input, mapId: c.req.param("mapId") }, auth, key),
      errors: {
        ...errorGroup(404, "The map does not exist", "MAP_NOT_FOUND"),
        ...errorGroup(409, "Another map already uses this name", "MAP_NAME_CONFLICT"),
      },
    });
  });

  app.put("/v1/admin/titles/:titleKey", async (c) => {
    return adminMutation(c, {
      schema: adminCatalogTitleUpdateRequestSchema,
      action: (input, auth, key) => dependencies.services(c).updateAdminCatalogTitle({ ...input, titleKey: c.req.param("titleKey") }, auth, key),
      errors: {
        ...errorGroup(404, "The title does not exist", "TITLE_NOT_FOUND"),
        ...errorGroup(422, "The scope cannot change while acquisition paths exist", "TITLE_SCOPE_LOCKED"),
        ...errorGroup(422, "A developer-retained title cannot become a player challenge", "DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE"),
      },
    });
  });

  app.post("/v1/admin/titles/:titleKey/icon", maintainerRoute(requireMaintainer, async (c, auth) => {
    try {
      const form = await c.req.raw.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return errorResponse(c, 422, "ICON_FILE_REQUIRED", "An icon file is required");
      const result = await dependencies.services(c).uploadAdminTitleIcon({ titleKey: c.req.param("titleKey")!, body: await file.arrayBuffer(), contentType: file.type }, auth);
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
      action: async (input, auth, key) => ({ contractVersion: "1", ...await dependencies.services(c).updateAdminChallenge({ ...input, challengeId: c.req.param("challengeId") }, auth, key) }),
      errors: {
        ...errorGroup(404, "The achievement does not exist", "CHALLENGE_NOT_FOUND"),
        ...errorGroup(422, "The challenge lifecycle metadata is invalid", "MAP_NOT_FOUND", "MAP_NOT_ACTIVE", "INVALID_MAP_SCOPE", "ACHIEVEMENT_GAME_VERSION_REQUIRED", "CHALLENGE_QUALIFICATION_CHANGED", "INVALID_CHALLENGE_WINDOW", "INVALID_SUBMISSION_MODE", "STANDALONE_MODE_NOT_FOUND"),
        ...errorGroup(409, "The title cannot accept a replacement challenge", "TITLE_MANAGED_BY_MAP_RULE"),
      },
    });
  });

};

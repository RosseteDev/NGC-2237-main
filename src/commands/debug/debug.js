// src/commands/utils/debug.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { Logger, createLogger } from "../../utils/Logger.js";

const logger = createLogger("debug");

export const data = buildCommand("utils", "debug");

export async function execute(context) {
  const t = await createTranslator(data, context);
  const subcommand = context.options.data[0]?.name || 'status';
  
  switch (subcommand) {
    case "enable": {
      const modules = context.options.getString("modules") || "*";
      Logger.enableDebug(modules);
      
      logger.info(`Debug habilitado: ${modules} por ${context.user.tag}`);
      
      await context.success(
        t("enabled_title"),
        t("enabled_description", { modules })
      );
      break;
    }
    
    case "disable": {
      Logger.disableDebug();
      
      logger.info(`Debug deshabilitado por ${context.user.tag}`);
      
      await context.success(
        t("disabled_title"),
        t("disabled_description")
      );
      break;
    }
    
    case "status": {
      const status = Logger.getStatus();
      const statusIcon = status.debugEnabled ? "✅" : "❌";
      const modules = status.debugModules.join(", ") || t("none");
      
      await context.info(
        t("status_title"),
        t("status_description", {
          status: statusIcon,
          modules,
          level: status.logLevel,
          timestamp: status.showTimestamp ? t("yes") : t("no"),
          colors: status.colorize ? t("yes") : t("no")
        })
      );
      break;
    }
    
    case "level": {
      const level = context.options.getString("level");
      Logger.setLevel(level);
      
      logger.info(`Log level → ${level} por ${context.user.tag}`);
      
      await context.success(
        t("level_title"),
        t("level_description", { level: level.toUpperCase() })
      );
      break;
    }
  }
}
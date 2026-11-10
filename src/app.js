const statusElement = document.querySelector("#app-status");
const createFeatureButton = document.querySelector("#create-feature-button");
const viewFeaturesButton = document.querySelector("#view-features-button");
const digitizingHelpButton = document.querySelector("#digitizing-help-button");
const geometryEditHelpButton = document.querySelector("#geometry-edit-help-button");
const respondentStepButton = document.querySelector("#respondent-step-button");
const respondentStep = document.querySelector("#respondent-step");
const featuresStep = document.querySelector("#features-step");
const submissionStep = document.querySelector("#submission-step");
const submissionStepNote = document.querySelector("#submission-step-note");
const submitResponseButton = document.querySelector("#submit-response-button");
const cancelDrawingButton = document.querySelector("#cancel-drawing-button");
const geometryEditActions = document.querySelector("#geometry-edit-actions");
const saveGeometryEditButton = document.querySelector("#save-geometry-edit-button");
const cancelGeometryEditButton = document.querySelector("#cancel-geometry-edit-button");
const respondentDialog = document.querySelector("#respondent-dialog");
const respondentForm = document.querySelector("#respondent-form");
const respondentSubmitButton = document.querySelector("#respondent-submit");
const respondentIntro = document.querySelector("#respondent-intro");
const respondentFields = document.querySelector("#respondent-fields");
const featureDialog = document.querySelector("#feature-dialog");
const featureForm = document.querySelector("#feature-form");
const featureFields = document.querySelector("#feature-fields");
const saveFeatureButton = document.querySelector("#save-feature-button");
const featuresTableDialog = document.querySelector("#features-table-dialog");
const featuresTableBody = document.querySelector("#features-table-body");
const featuresTableCount = document.querySelector("#features-table-count");
const featuresTableHeaderRow = document.querySelector("#features-table-header-row");
const digitizingHelpDialog = document.querySelector("#digitizing-help-dialog");
const geometryEditHelpDialog = document.querySelector("#geometry-edit-help-dialog");
const thankYouDialog = document.querySelector("#thank-you-dialog");
const mapLayerPanel = document.querySelector(".map-layer-panel");
const mapLayerOptions = document.querySelector("#map-layer-options");

const appState = {
  respondent: null,
  responseId: null,
  features: [],
  submissionInProgress: false,
  submissionComplete: false
};

let view;
let graphicsLayer;
let sketchViewModel;
let activeDraft;
let geodeticAreaOperator;
let geodeticLengthOperator;
let simplifyOperator;
let FeatureLayer;
let Graphic;
let featureLayerUrl;
let activeGeometryEdit;
let config;

async function loadQuestionnaireConfig() {
  const questionnaireIds = new URLSearchParams(window.location.search).getAll("id");
  if (questionnaireIds.length !== 1 || !questionnaireIds[0]) {
    throw new Error("Kyselytunniste puuttuu. Valitse kysely URL-parametrilla, esimerkiksi ?id=demo.");
  }
  const questionnaireId = questionnaireIds[0];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(questionnaireId)) {
    throw new Error("Kyselytunniste on virheellinen. Käytä pieniä kirjaimia, numeroita ja väliviivoja.");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    const localConfigUrl = new URL(`../questionnaires/${questionnaireId}.local.json`, import.meta.url);
    const localConfigResponse = await fetch(localConfigUrl, { cache: "no-store" });
    if (localConfigResponse.ok) {
      return localConfigResponse.json();
    }
    if (localConfigResponse.status !== 404) {
      throw new Error(`Paikallisen kyselyasetuksen lataus epäonnistui (${localConfigResponse.status}).`);
    }
  }

  const configUrl = new URL(`../questionnaires/${questionnaireId}.json`, import.meta.url);
  const configResponse = await fetch(configUrl, { cache: "no-store" });
  if (configResponse.status === 404) {
    throw new Error(`Kyselyä "${questionnaireId}" ei löydy.`);
  }
  if (!configResponse.ok) {
    throw new Error(`Kyselyn asetuksen lataus epäonnistui (${configResponse.status}).`);
  }
  return configResponse.json();
}

async function startApp() {
  config = await loadQuestionnaireConfig();
  validateConfig(config);
  configureQuestionnaireUi();
  document.querySelector("#app-title").textContent = config.appTitle;
  document.title = config.appTitle;
  if (!config.active) {
    document.querySelector(".workflow").hidden = true;
    document.querySelector(".map-container").hidden = true;
    setStatus("Tämä kysely on suljettu, eikä siihen voi lähettää vastauksia.");
    return;
  }

  const [
    Map,
    MapView,
    GraphicsLayer,
    GeoJSONLayer,
    SketchViewModel,
    SimplifyOperator,
    GeodeticAreaOperator,
    GeodeticLengthOperator,
    FeatureLayerModule,
    GraphicModule
  ] = await window.$arcgis.import([
    "@arcgis/core/Map.js",
    "@arcgis/core/views/MapView.js",
    "@arcgis/core/layers/GraphicsLayer.js",
    "@arcgis/core/layers/GeoJSONLayer.js",
    "@arcgis/core/widgets/Sketch/SketchViewModel.js",
    "@arcgis/core/geometry/operators/simplifyOperator.js",
    "@arcgis/core/geometry/operators/geodeticAreaOperator.js",
    "@arcgis/core/geometry/operators/geodeticLengthOperator.js",
    "@arcgis/core/layers/FeatureLayer.js",
    "@arcgis/core/Graphic.js"
  ]);
  simplifyOperator = SimplifyOperator;
  geodeticAreaOperator = GeodeticAreaOperator;
  geodeticLengthOperator = GeodeticLengthOperator;
  FeatureLayer = FeatureLayerModule;
  Graphic = GraphicModule;
  featureLayerUrl = config.featureLayerUrl;
  if (config.questionnaire.geometryType === "polygon" &&
      config.questionnaire.geometryMeasurements?.polygon) {
    await geodeticAreaOperator.load();
  }
  if (config.questionnaire.geometryType === "polyline" &&
      config.questionnaire.geometryMeasurements?.polyline) {
    await geodeticLengthOperator.load();
  }
  const map = new Map({
    basemap: config.map.basemap
  });

  configureBackgroundLayers(map, GeoJSONLayer, FeatureLayer);

  graphicsLayer = new GraphicsLayer({ title: "Vastauksen aluekohteet" });
  map.add(graphicsLayer);

  view = new MapView({
    container: "viewDiv",
    map,
    center: config.map.initialView.type === "center"
      ? config.map.initialView.center
      : undefined,
    zoom: config.map.initialView.type === "center"
      ? config.map.initialView.zoom
      : undefined,
    spatialReference: { wkid: 3857 },
    popup: {
      dockEnabled: false,
      dockOptions: {
        buttonEnabled: false
      },
      visibleElements: {
        actionBar: false,
        collapseButton: false
      }
    }
  });

  await view.when();
  if (config.map.initialView.type === "extent") {
    await view.goTo({
      xmin: config.map.initialView.extent[0],
      ymin: config.map.initialView.extent[1],
      xmax: config.map.initialView.extent[2],
      ymax: config.map.initialView.extent[3],
      spatialReference: { wkid: config.map.initialView.wkid ?? 3857 }
    });
  }
  sketchViewModel = new SketchViewModel({
    view,
    layer: graphicsLayer
  });
  sketchViewModel.on("create", handleSketchEvent);
  sketchViewModel.on("update", handleGeometryUpdateEvent);
  respondentStepButton.disabled = false;
  statusElement.textContent = "Kartta valmis. Täytä vastaajan tiedot.";
}

function configureBackgroundLayers(map, GeoJSONLayer, FeatureLayer) {
  const layerConfigs = config.map.backgroundLayers ?? [];
  const enabledLayers = layerConfigs.filter((layer) => layer.enabled);
  if (!enabledLayers.length) {
    mapLayerPanel.hidden = true;
    return;
  }

  for (const layerConfig of enabledLayers) {
    const row = document.createElement("section");
    row.className = "map-layer-entry";

    const label = document.createElement("label");
    label.className = "map-layer-toggle";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = Boolean(layerConfig.visibleByDefault);
    label.append(toggle, document.createTextNode(layerConfig.title));

    const status = document.createElement("p");
    status.className = "map-layer-status";
    status.setAttribute("role", "status");
    status.textContent = "Ei ladattu. Valitse taso ladataksesi aineiston.";

    const attribution = document.createElement("p");
    attribution.className = "map-layer-attribution";
    const attributionParts = [
      `${layerConfig.source}. ${layerConfig.license}`,
      layerConfig.dataDate ? `Aineisto ${layerConfig.dataDate}.` : "",
      layerConfig.transformation ?? ""
    ].filter(Boolean);
    attribution.append(document.createTextNode(`${attributionParts.join(" ")} `));
    if (layerConfig.licenseUrl) {
      const licenseUrl = new URL(layerConfig.licenseUrl, document.baseURI);
      if (!["http:", "https:"].includes(licenseUrl.protocol)) {
        throw new Error("Lisenssitiedon linkin pitää käyttää HTTP- tai HTTPS-yhteyttä.");
      }
      const link = document.createElement("a");
      link.href = licenseUrl.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Lisätiedot";
      attribution.append(link);
    }

    row.append(label, status, attribution);
    mapLayerOptions.append(row);

    const Layer = layerConfig.type === "feature" ? FeatureLayer : GeoJSONLayer;
    const layerOptions = {
      url: new URL(layerConfig.url, document.baseURI).href,
      title: layerConfig.title,
      visible: false,
      popupEnabled: layerConfig.popupEnabled === true
    };
    if (!(layerConfig.type === "feature" && layerConfig.useServiceRenderer === true)) {
      layerOptions.renderer = createBackgroundRenderer(layerConfig);
    }
    const layer = new Layer(layerOptions);
    map.add(layer);

    const layerState = { layer, toggle, status, loadPromise: null };
    toggle.addEventListener("change", () => {
      void setBackgroundLayerVisibility(layerState);
    });
    if (toggle.checked) {
      void setBackgroundLayerVisibility(layerState);
    }
  }
}

function createBackgroundRenderer(layerConfig) {
  if (layerConfig.geometryType === "polyline") {
    return {
      type: "simple",
      symbol: {
        type: "simple-line",
        color: layerConfig.color ?? [210, 105, 30, 190],
        width: layerConfig.width ?? 1
      }
    };
  }
  return {
    type: "simple",
    symbol: {
      type: "simple-marker",
      color: layerConfig.color ?? [34, 91, 126, 220],
      size: layerConfig.size ?? 5,
      outline: {
        color: [255, 255, 255, 220],
        width: 0.5
      }
    }
  };
}

async function setBackgroundLayerVisibility(layerState) {
  const { layer, toggle, status } = layerState;
  if (!toggle.checked) {
    layer.visible = false;
    return;
  }

  if (!layerState.loadPromise) {
    toggle.disabled = true;
    status.classList.remove("map-layer-status--error");
    status.textContent = "Ladataan aineistoa...";
    layerState.loadPromise = layer.load();
  }

  try {
    await layerState.loadPromise;
    if (layer.popupEnabled && !layer.popupTemplate) {
      layer.popupTemplate = {
        title: layer.title,
        content: [{
          type: "fields",
          fieldInfos: layer.fields.map((field) => ({
            fieldName: field.name,
            label: field.alias,
            visible: true
          }))
        }]
      };
    }
    layer.visible = toggle.checked;
    status.textContent = "Aineisto ladattu.";
  } catch (error) {
    layer.visible = false;
    toggle.checked = false;
    toggle.disabled = true;
    status.textContent = `Aineiston lataus epäonnistui: ${error.message}`;
    status.classList.add("map-layer-status--error");
    return;
  }
  toggle.disabled = false;
}

function validateConfig(config) {
  const geometryTypes = ["point", "polyline", "polygon"];
  const fieldTypes = ["text", "textarea", "number", "date", "email", "tel", "select"];
  const questionnaire = config?.questionnaire;
  if (!config || typeof config.appTitle !== "string" ||
      typeof config.active !== "boolean" ||
      typeof config.featureLayerUrl !== "string" || !config.map?.basemap ||
      !config.map.initialView || !geometryTypes.includes(questionnaire?.geometryType) ||
      !Array.isArray(questionnaire.respondent?.fields) ||
      !Array.isArray(questionnaire.features?.fields) ||
      !questionnaire.systemFields?.localId || !questionnaire.systemFields?.responseId ||
      !questionnaire.steps || !questionnaire.respondent.title ||
      !questionnaire.respondent.description || !questionnaire.features.title ||
      !questionnaire.features.description || !questionnaire.help ||
      !Array.isArray(questionnaire.help.digitizingItems) ||
      !Array.isArray(questionnaire.help.geometryEditingItems) ||
      !questionnaire.buttons || !questionnaire.features.tableTitle ||
      !questionnaire.features.idColumnLabel || !questionnaire.features.actionsColumnLabel) {
    throw new Error("Asetustiedoston kyselyn, kartan tai kohdetyypin määritys puuttuu tai on virheellinen.");
  }
  const backgroundLayers = config.map.backgroundLayers ?? [];
  if (!Array.isArray(backgroundLayers) ||
      backgroundLayers.some((layer) =>
        !layer || typeof layer.id !== "string" || typeof layer.title !== "string" ||
        typeof layer.url !== "string" ||
        (layer.type !== undefined && !["geojson", "feature"].includes(layer.type)) ||
        (layer.useServiceRenderer !== undefined &&
          typeof layer.useServiceRenderer !== "boolean") ||
        (layer.useServiceRenderer === true && layer.type !== "feature") ||
        (layer.popupEnabled !== undefined && typeof layer.popupEnabled !== "boolean") ||
        (layer.popupEnabled === true && layer.type !== "feature") ||
        !["point", "polyline"].includes(layer.geometryType) ||
        typeof layer.enabled !== "boolean")) {
    throw new Error("Asetustiedoston taustatasojen määritys on virheellinen.");
  }
  if (isUnresolvedUrl(config.featureLayerUrl) ||
      backgroundLayers.some((layer) =>
        layer.type === "feature" && isUnresolvedUrl(layer.url))) {
    throw new Error("ArcGIS-palveluosoite puuttuu. Käytä paikallista .local.json-asetusta tai julkaisuhetkellä täydennettyä asetusta.");
  }
  const requiredLabels = [
    questionnaire.steps.respondent,
    questionnaire.steps.features,
    questionnaire.steps.submission,
    questionnaire.featureActionLabel,
    questionnaire.submitLabel,
    questionnaire.optionalLabel,
    questionnaire.requiredFieldMessage,
    questionnaire.selectPlaceholder,
    questionnaire.help.digitizingTitle,
    questionnaire.help.digitizingButton,
    questionnaire.help.geometryEditingTitle,
    questionnaire.help.geometryEditingButton,
    ...Object.values(questionnaire.buttons)
  ];
  if (requiredLabels.some((label) => typeof label !== "string" || !label.trim()) ||
      [...questionnaire.help.digitizingItems, ...questionnaire.help.geometryEditingItems]
        .some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error("Asetustiedoston kyselyn otsikoista, painikkeista tai ohjeista puuttuu tekstiä.");
  }

  if (config.map.initialView.type === "center") {
    if (!Array.isArray(config.map.initialView.center) ||
        config.map.initialView.center.length !== 2 ||
        !config.map.initialView.center.every(Number.isFinite) ||
        !Number.isFinite(config.map.initialView.zoom)) {
      throw new Error("Asetustiedoston aloitusnäkymän keskipiste tai zoomaustaso on virheellinen.");
    }
  } else if (config.map.initialView.type === "extent") {
    const extent = config.map.initialView.extent;
    if (!Array.isArray(extent) || extent.length !== 4 ||
        !extent.every(Number.isFinite) || extent[0] >= extent[2] || extent[1] >= extent[3]) {
      throw new Error("Asetustiedoston aloitusnäkymän rajauslaatikko on virheellinen.");
    }
  } else {
    throw new Error("Aloitusnäkymän tyypin pitää olla center tai extent.");
  }

  const fields = [...questionnaire.respondent.fields, ...questionnaire.features.fields];
  const names = fields.map((field) => field.name);
  if (new Set(names).size !== names.length ||
      names.includes(questionnaire.systemFields.localId) ||
      names.includes(questionnaire.systemFields.responseId) ||
      questionnaire.systemFields.localId === questionnaire.systemFields.responseId) {
    throw new Error("Asetustiedoston kenttien ja järjestelmätunnisteiden nimien on oltava yksilöllisiä.");
  }
  fields.forEach((field) => {
    if (typeof field.name !== "string" || !field.name.trim() ||
        typeof field.label !== "string" || !field.label.trim() ||
        !fieldTypes.includes(field.type) ||
        typeof field.required !== "boolean") {
      throw new Error("Asetustiedostossa on virheellinen kenttämääritys.");
    }
    if (field.validation != null && typeof field.validation !== "object") {
      throw new Error(`Kentän ${field.label} validointimääritys ei kelpaa.`);
    }
    if (field.type === "select" &&
        (!Array.isArray(field.options) || field.options.length === 0 ||
          field.options.some((option) => !option.label || option.value == null))) {
      throw new Error(`Valintakentän ${field.label} vaihtoehdot puuttuvat tai ovat virheelliset.`);
    }
    if (field.type === "select" &&
        new Set(field.options.map((option) => String(option.value))).size !== field.options.length) {
      throw new Error(`Valintakentän ${field.label} vaihtoehtojen arvojen pitää olla yksilöllisiä.`);
    }
  });
  Object.entries(questionnaire.geometryMeasurements ?? {}).forEach(([type, measurement]) => {
    if (measurement && (!geometryTypes.includes(type) ||
        typeof measurement.label !== "string" || !measurement.label.trim() ||
        typeof measurement.unit !== "string" ||
        !Number.isInteger(measurement.precision) ||
        measurement.precision < 0 || measurement.precision > 6)) {
      throw new Error(`Geometriatyypin ${type} mittausmääritys ei kelpaa.`);
    }
  });
  if (questionnaire.geometryType === "point" && questionnaire.geometryMeasurements?.point) {
    throw new Error("Pistemäisille kohteille ei voi määrittää pinta-ala- tai pituusmittausta.");
  }
}

function isUnresolvedUrl(value) {
  return /^__[A-Z0-9_]+__$/.test(value);
}

function configureQuestionnaireUi() {
  const questionnaire = config.questionnaire;
  document.querySelector("#questionnaire-intro").textContent = questionnaire.introduction ?? "";
  document.querySelector("#respondent-step-label").textContent = questionnaire.steps.respondent;
  document.querySelector("#features-step-label").textContent = questionnaire.steps.features;
  document.querySelector("#submission-step-label").textContent = questionnaire.steps.submission;
  document.querySelector("#respondent-title").textContent = questionnaire.respondent.title;
  document.querySelector("#respondent-intro").textContent = questionnaire.respondent.description;
  document.querySelector("#feature-title").textContent = questionnaire.features.title;
  document.querySelector("#feature-dialog .form-intro").textContent = questionnaire.features.description;
  createFeatureButton.textContent = questionnaire.featureActionLabel;
  document.querySelector("#digitizing-help-title").textContent = questionnaire.help.digitizingTitle;
  document.querySelector("#geometry-edit-help-title").textContent = questionnaire.help.geometryEditingTitle;
  document.querySelector("#features-table-title").textContent = questionnaire.features.tableTitle;
  document.querySelector("#submit-response-button").textContent = questionnaire.submitLabel;
  document.querySelector("#respondent-title").parentElement.querySelector("[data-close-dialog]").textContent =
    questionnaire.buttons.cancel;
  document.querySelector("#respondent-submit").textContent = questionnaire.buttons.saveRespondent;
  document.querySelector("#cancel-feature-button").textContent = questionnaire.buttons.cancelFeature;
  document.querySelector("#save-feature-button").textContent = questionnaire.buttons.saveFeature;
  document.querySelector("#close-features-table-button").textContent = questionnaire.buttons.close;
  document.querySelector("#close-digitizing-help-button").textContent = questionnaire.buttons.close;
  document.querySelector("#close-geometry-edit-help-button").textContent = questionnaire.buttons.close;
  digitizingHelpButton.textContent = questionnaire.help.digitizingButton;
  geometryEditHelpButton.textContent = questionnaire.help.geometryEditingButton;
  viewFeaturesButton.textContent = questionnaire.buttons.viewFeatures;
  document.querySelector("#digitizing-help-list").replaceChildren(
    ...questionnaire.help.digitizingItems.map(createHelpItem)
  );
  document.querySelector("#geometry-edit-help-list").replaceChildren(
    ...questionnaire.help.geometryEditingItems.map(createHelpItem)
  );
  renderFields(respondentFields, questionnaire.respondent.fields, "respondent");
  renderFields(featureFields, questionnaire.features.fields, "feature");

  const headers = [questionnaire.features.idColumnLabel];
  headers.push(...questionnaire.features.fields.map((field) => field.label));
  if (getMeasurementConfig()) {
    headers.push(getMeasurementConfig().label);
  }
  headers.push(questionnaire.features.actionsColumnLabel);
  featuresTableHeaderRow.replaceChildren(...headers.map((label) => {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = label;
    return header;
  }));
}

function createHelpItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function renderFields(container, fields, prefix) {
  container.replaceChildren(...fields.map((field, index) => {
    const wrapper = document.createElement("div");
    const inputId = `${prefix}-field-${index}`;
    const label = document.createElement("label");
    label.htmlFor = inputId;
    label.append(document.createTextNode(field.label));
    if (!field.required) {
      const optional = document.createElement("span");
      optional.textContent = ` (${config.questionnaire.optionalLabel})`;
      label.append(optional);
    }

    const input = createFieldInput(field, inputId);
    if (field.helpText) {
      const help = document.createElement("small");
      help.className = "field-help";
      help.id = `${inputId}-help`;
      help.textContent = field.helpText;
      input.setAttribute("aria-describedby", help.id);
      wrapper.append(label, input, help);
    } else {
      wrapper.append(label, input);
    }
    return wrapper;
  }));
}

function createFieldInput(field, inputId) {
  const input = field.type === "select"
    ? document.createElement("select")
    : field.type === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");
  input.id = inputId;
  input.name = field.name;
  input.dataset.fieldName = field.name;
  input.dataset.fieldType = field.type;
  input.required = field.required;
  if (field.autocomplete) {
    input.autocomplete = field.autocomplete;
  }
  const validation = field.validation ?? {};
  Object.entries({
    maxLength: "maxLength",
    minLength: "minLength",
    min: "min",
    max: "max",
    step: "step",
    pattern: "pattern"
  }).forEach(([key, property]) => {
    if (validation[key] != null) {
      input[property] = validation[key];
    }
  });
  if (field.type === "select") {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = field.placeholder ?? config.questionnaire.selectPlaceholder;
    input.append(placeholder);
    field.options.forEach((choice) => {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      input.append(option);
    });
  } else if (field.type !== "textarea") {
    input.type = field.type;
  }
  return input;
}

function getMeasurementConfig() {
  if (config.questionnaire.geometryType === "point") {
    return null;
  }
  return config.questionnaire.geometryMeasurements?.[config.questionnaire.geometryType] ?? null;
}

function activateFeatureStep() {
  respondentStep.classList.remove("workflow-step-item--active");
  respondentStep.classList.add("workflow-step-item--complete");
  featuresStep.classList.remove("workflow-step-item--pending");
  featuresStep.classList.add("workflow-step-item--active");
  featuresStep.removeAttribute("aria-disabled");
  createFeatureButton.hidden = false;
  createFeatureButton.disabled = false;
  digitizingHelpButton.hidden = false;
}

function activateSubmissionStep() {
  submissionStep.classList.remove("workflow-step-item--pending");
  submissionStep.classList.add("workflow-step-item--ready");
  submissionStep.removeAttribute("aria-disabled");
  submissionStepNote.textContent = `${formatFeatureCount(appState.features.length)} valmiina lähetykseen`;
  submitResponseButton.hidden = false;
  submitResponseButton.disabled = appState.submissionInProgress || appState.submissionComplete;
  submitResponseButton.textContent = config.questionnaire.submitLabel;
}

function completeWorkflow() {
  [respondentStep, featuresStep, submissionStep].forEach((step) => {
    step.classList.remove(
      "workflow-step-item--active",
      "workflow-step-item--pending",
      "workflow-step-item--ready"
    );
    step.classList.add("workflow-step-item--complete");
    step.removeAttribute("aria-disabled");
  });
  const completedRespondentStep = document.createElement("span");
  completedRespondentStep.className = "workflow-step";
  completedRespondentStep.append(...respondentStepButton.childNodes);
  respondentStepButton.replaceWith(completedRespondentStep);
  submissionStepNote.textContent = "Valmis";
}

function formatFeatureCount(count) {
  return `${count} ${count === 1 ? "kohde" : "kohdetta"}`;
}

function deleteFeature(featureId) {
  if (appState.submissionComplete || appState.submissionInProgress || activeGeometryEdit) {
    return;
  }

  const featureIndex = appState.features.findIndex((feature) => feature.id === featureId);
  const graphic = graphicsLayer.graphics.find((candidate) =>
    candidate.attributes?.[config.questionnaire.systemFields.localId] === featureId
  );
  if (featureIndex === -1 || !graphic) {
    setStatus("Poistettavaa kohdetta ei löytynyt sovelluksen tiedoista.", true);
    return;
  }

  appState.features.splice(featureIndex, 1);
  graphicsLayer.remove(graphic);
  renderFeaturesTable();

  if (appState.features.length === 0) {
    submissionStep.classList.remove("workflow-step-item--ready");
    submissionStep.classList.add("workflow-step-item--pending");
    submissionStep.setAttribute("aria-disabled", "true");
    submissionStepNote.textContent = "Lukittu: lisää vähintään yksi kohde";
    submitResponseButton.hidden = true;
    submitResponseButton.disabled = true;
  } else {
    activateSubmissionStep();
  }

  setStatus(`Kohde poistettu. Vastauksessa on ${formatFeatureCount(appState.features.length)}.`);
}

function renderFeaturesTable() {
  const rows = appState.features.map((feature) => {
    const row = document.createElement("tr");
    const idCell = document.createElement("td");
    idCell.textContent = feature.id;
    row.append(idCell);
    config.questionnaire.features.fields.forEach((field) => {
      row.append(createEditableCell(feature, field));
    });
    const measurementConfig = getMeasurementConfig();
    if (measurementConfig) {
      const measurementCell = document.createElement("td");
      measurementCell.textContent = formatMeasurement(feature.measurement, measurementConfig.precision);
      row.append(measurementCell);
    }

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "feature-row-actions";
    const geometryButton = document.createElement("button");
    geometryButton.className = "secondary-button geometry-edit-button";
    geometryButton.type = "button";
    geometryButton.textContent = config.questionnaire.buttons.editGeometry;
    geometryButton.dataset.action = "edit-geometry";
    geometryButton.dataset.featureId = feature.id;
    geometryButton.disabled = appState.submissionComplete || appState.submissionInProgress;
    actions.append(geometryButton);

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary-button delete-feature-button";
    deleteButton.type = "button";
    deleteButton.textContent = config.questionnaire.buttons.deleteFeature;
    deleteButton.dataset.action = "delete-feature";
    deleteButton.dataset.featureId = feature.id;
    deleteButton.disabled = appState.submissionComplete || appState.submissionInProgress;
    actions.append(deleteButton);
    actionsCell.append(actions);
    row.append(actionsCell);
    return row;
  });

  if (rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = config.questionnaire.features.fields.length + 2 +
      (getMeasurementConfig() ? 1 : 0);
    cell.textContent = config.questionnaire.features.emptyMessage;
    row.append(cell);
    rows.push(row);
  }

  featuresTableBody.replaceChildren(...rows);
  featuresTableCount.textContent =
    appState.features.length === 1
      ? "1 kohde"
      : `${appState.features.length} kohdetta`;
}

function createEditableCell(feature, field) {
  const cell = document.createElement("td");
  cell.className = "editable-cell";
  cell.dataset.featureId = feature.id;
  cell.dataset.field = field.name;

  const content = document.createElement("div");
  content.className = "editable-cell-content";
  const value = document.createElement("span");
  value.textContent = formatFieldValue(feature.attributes[field.name], field);
  content.append(value);

  const button = document.createElement("button");
  button.className = "table-icon-button";
  button.type = "button";
  button.textContent = "✎";
  button.setAttribute("aria-label", `${config.questionnaire.buttons.editField} ${field.label}, ${feature.id}`);
  button.title = `${config.questionnaire.buttons.editField}: ${field.label}`;
  button.dataset.action = "edit-field";
  button.dataset.featureId = feature.id;
  button.dataset.field = field.name;
  button.disabled = appState.submissionComplete || appState.submissionInProgress;
  cell.append(content, button);
  return cell;
}

function startFieldEditing(button) {
  if (appState.submissionComplete || appState.submissionInProgress) {
    return;
  }
  const feature = appState.features.find((item) => item.id === button.dataset.featureId);
  if (!feature) {
    setStatus("Muokattavaa kohdetta ei löytynyt.", true);
    return;
  }
  if (featuresTableBody.querySelector(".editable-cell-editor")) {
    setStatus("Tallenna tai peruuta ensin avoinna oleva kenttämuokkaus.");
    return;
  }

  const { field: fieldName } = button.dataset;
  const field = config.questionnaire.features.fields.find((item) => item.name === fieldName);
  const cell = button.closest("td");
  const editor = createFieldInput(field, `edit-${feature.id}-${field.name}`);
  editor.className = `editable-cell-editor${field.type === "textarea" ? " editable-cell-editor--multiline" : ""}`;
  editor.setAttribute("aria-label", field.label);
  editor.value = fieldInputValue(feature.attributes[field.name], field);

  const saveButton = createEditIconButton(
    "✓",
    `${config.questionnaire.buttons.saveField} ${field.label}`,
    "save-field"
  );
  saveButton.dataset.featureId = feature.id;
  saveButton.dataset.field = field.name;
  const cancelButton = createEditIconButton(
    "×",
    `${config.questionnaire.buttons.cancelField} ${field.label}`,
    "cancel-field"
  );
  cancelButton.dataset.featureId = feature.id;
  cancelButton.dataset.field = field.name;

  const content = document.createElement("div");
  content.className = "editable-cell-content";
  content.append(editor);
  cell.replaceChildren(content, saveButton, cancelButton);
  editor.focus();
}

function createEditIconButton(icon, label, action) {
  const button = document.createElement("button");
  button.className = "table-icon-button";
  button.type = "button";
  button.textContent = icon;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.dataset.action = action;
  return button;
}

function saveFieldEditing(button) {
  const { featureId, field: fieldName } = button.dataset;
  const field = config.questionnaire.features.fields.find((item) => item.name === fieldName);
  const feature = appState.features.find((item) => item.id === featureId);
  const cell = button.closest("td");
  const editor = cell.querySelector(".editable-cell-editor");
  if (!editor.checkValidity()) {
    editor.reportValidity();
    return;
  }

  const value = getFieldValue(editor, field);
  editor.setCustomValidity(
    field.required && !editor.value.trim()
      ? `${field.label} ${config.questionnaire.requiredFieldMessage}`
      : ""
  );
  if (!editor.checkValidity()) {
    editor.reportValidity();
    return;
  }
  feature.attributes[field.name] = value;
  const graphic = graphicsLayer.graphics.find((candidate) =>
    candidate.attributes?.[config.questionnaire.systemFields.localId] === featureId
  );
  if (graphic) {
    graphic.attributes = { ...graphic.attributes, [field.name]: value };
  }
  renderFeaturesTable();
  setStatus(`Kentän ${field.label} muutos tallennettiin kohteelle.`);
}

function formatFieldValue(value, field) {
  if (value == null || value === "") {
    return "—";
  }
  if (field.type === "select") {
    return field.options.find((option) => String(option.value) === String(value))?.label ?? value;
  }
  if (field.type === "date" && Number.isFinite(value)) {
    return new Date(value).toLocaleDateString("fi-FI");
  }
  return String(value);
}

function startGeometryEditing(featureId) {
  if (appState.submissionComplete || appState.submissionInProgress || activeGeometryEdit) {
    return;
  }
  const feature = appState.features.find((item) => item.id === featureId);
  const graphic = graphicsLayer.graphics.find((candidate) =>
    candidate.attributes?.[config.questionnaire.systemFields.localId] === featureId
  );
  if (!feature || !graphic) {
    setStatus("Muokattavan kohteen geometriaa ei löytynyt.", true);
    return;
  }

  featuresTableDialog.close();
  activeGeometryEdit = {
    feature,
    graphic,
    originalGeometry: graphic.geometry.clone()
  };
  geometryEditActions.hidden = false;
  geometryEditHelpButton.hidden = false;
  createFeatureButton.disabled = true;
  respondentStepButton.disabled = true;
  viewFeaturesButton.disabled = true;
  cancelDrawingButton.hidden = true;
  setStatus("Geometrian muokkaus aloitettu.");
  try {
    sketchViewModel.update(graphic, {
      tool: config.questionnaire.geometryType === "point" ? "transform" : "reshape"
    });
  } catch (error) {
    finishGeometryEditing(false);
    setStatus(`Geometrian muokkausta ei voitu aloittaa. ${error.message}`, true);
  }
}

function handleGeometryUpdateEvent(event) {
  if (!activeGeometryEdit) {
    return;
  }
  if (event.state === "complete") {
    try {
      if (!isValidGeometry(activeGeometryEdit.graphic.geometry)) {
        finishGeometryEditing(false);
        setStatus("Kohteen geometria ei ole kelvollinen, joten alkuperäinen geometria palautettiin.", true);
        return;
      }
      const measurement = calculateMeasurement(activeGeometryEdit.graphic.geometry);
      activeGeometryEdit.feature.geometry = activeGeometryEdit.graphic.geometry;
      activeGeometryEdit.feature.measurement = measurement;
      finishGeometryEditing(true);
      setStatus("Geometria tallennettu.");
    } catch (error) {
      finishGeometryEditing(false);
      setStatus(`Geometrian tallentaminen epäonnistui. ${error.message}`, true);
    }
  } else if (event.state === "cancel") {
    finishGeometryEditing(false);
    setStatus("Geometrian muokkaus peruutettu.");
  }
}

function finishGeometryEditing(keepChanges) {
  if (!activeGeometryEdit) {
    return;
  }
  if (!keepChanges) {
    activeGeometryEdit.graphic.geometry = activeGeometryEdit.originalGeometry;
    activeGeometryEdit.feature.geometry = activeGeometryEdit.originalGeometry;
  }
  activeGeometryEdit = null;
  geometryEditActions.hidden = true;
  geometryEditHelpButton.hidden = true;
  createFeatureButton.disabled = appState.submissionComplete;
  respondentStepButton.disabled = appState.submissionComplete;
  viewFeaturesButton.disabled = false;
  renderFeaturesTable();
}

function formatMeasurement(value, precision) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("fi-FI", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value);
}

function calculateMeasurement(geometry) {
  const measurement = getMeasurementConfig();
  if (!measurement) {
    return null;
  }
  const operator = config.questionnaire.geometryType === "polygon"
    ? geodeticAreaOperator
    : geodeticLengthOperator;
  const value = operator.execute(geometry, { unit: measurement.unit });
  if (!Number.isFinite(value)) {
    throw new Error(`Kohteen ${measurement.label.toLowerCase()} ei voitu laskea.`);
  }
  return Math.abs(value);
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("app-status--error", isError);
}

async function submitResponse() {
  if (!config?.active) {
    setStatus("Tämä kysely on suljettu, eikä siihen voi lähettää vastauksia.", true);
    return;
  }
  if (appState.submissionInProgress || appState.submissionComplete) {
    return;
  }
  if (appState.features.length === 0) {
    setStatus("Vastauksessa ei ole lähetettäviä kohteita.", true);
    return;
  }

  appState.submissionInProgress = true;
  submitResponseButton.disabled = true;
  submitResponseButton.textContent = "Lähetetään...";
  setStatus(`Lähetetään ${formatFeatureCount(appState.features.length)} ArcGIS Onlineen...`);

  let applyEditsStarted = false;
  let successfulAddCount;
  const attemptedAddCount = appState.features.length;
  try {
    const layer = new FeatureLayer({ url: featureLayerUrl });
    await layer.load();

    const addFeatures = appState.features.map((feature) => {
      const attributes = {};
      [...config.questionnaire.respondent.fields, ...config.questionnaire.features.fields]
        .forEach((field) => {
          attributes[field.name] = feature.attributes[field.name];
        });
      attributes[config.questionnaire.systemFields.responseId] = appState.responseId;
      return new Graphic({ geometry: feature.geometry, attributes });
    });

    applyEditsStarted = true;
    const result = await layer.applyEdits({ addFeatures });
    const addResults = result?.addFeatureResults;
    if (!Array.isArray(addResults) || addResults.length !== addFeatures.length) {
      throw new Error("ArcGIS Online palautti puutteellisen tallennustuloksen.");
    }

    const successfulResults = addResults.filter(
      (item) => !item.error && (item.objectId != null || item.globalId != null)
    );
    successfulAddCount = successfulResults.length;
    const failures = addResults.filter(
      (item) => item.error || (item.objectId == null && item.globalId == null)
    );
    if (failures.length > 0) {
      const messages = failures
        .map((item) => item.error?.description || item.error?.message)
        .filter(Boolean);
      throw new Error(
        `${failures.length} kohteen tallennus epäonnistui.${messages.length ? ` ${messages.join(" ")}` : ""}`
      );
    }

    appState.submissionComplete = true;
    submitResponseButton.hidden = true;
    createFeatureButton.hidden = true;
    viewFeaturesButton.hidden = true;
    digitizingHelpButton.hidden = true;
    geometryEditHelpButton.hidden = true;
    createFeatureButton.disabled = true;
    respondentStepButton.disabled = true;
    viewFeaturesButton.disabled = true;
    digitizingHelpButton.disabled = true;
    completeWorkflow();
    setStatus(`${successfulAddCount}/${attemptedAddCount} kohdetta lähetetty onnistuneesti. Voit sulkea välilehden.`);
    thankYouDialog.showModal();
  } catch (error) {
    if (applyEditsStarted) {
      appState.submissionComplete = true;
      submissionStepNote.textContent = "Lähetys epäonnistui tai tulos jäi epäselväksi";
      submitResponseButton.hidden = true;
      createFeatureButton.disabled = true;
      respondentStepButton.disabled = true;
      setStatus(
        `Lähetys epäonnistui tai sen tulosta ei voitu varmistaa.${successfulAddCount == null ? "" : ` Vahvistetusti tallennettu ${successfulAddCount}/${attemptedAddCount} kohdetta.`} Tarkista tason tila ennen uutta lähetystä. ${error.message}`,
        true
      );
    } else {
      submitResponseButton.disabled = false;
      submitResponseButton.textContent = "Yritä lähetystä uudelleen";
      setStatus(`ArcGIS Online -tasoon ei saatu yhteyttä. ${error.message}`, true);
    }
  } finally {
    appState.submissionInProgress = false;
  }
}

function formIsComplete(form) {
  return [...form.querySelectorAll("[data-field-name]")].every((input) => {
    const requiredValuePresent = !input.required ||
      (input.type === "number" ? input.value !== "" : input.value.trim().length > 0);
    return requiredValuePresent && input.checkValidity();
  });
}

function getFieldValue(input, field) {
  const value = input.value.trim();
  if (!value) {
    return field.type === "number" ? null : "";
  }
  if (field.type === "number") {
    return Number(value);
  }
  if (field.type === "select") {
    return field.options.find((option) => String(option.value) === value)?.value ?? value;
  }
  if (field.type === "date") {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new Error(`Kentän ${field.label} päivämäärä ei kelpaa.`);
    }
    return timestamp;
  }
  return value;
}

function fieldInputValue(value, field) {
  if (field.type === "date" && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return value ?? "";
}

function updateRespondentSubmitState() {
  respondentSubmitButton.disabled = !formIsComplete(respondentForm);
}

function openRespondentDialog() {
  const isEditing = appState.respondent !== null;
  config.questionnaire.respondent.fields.forEach((field) => {
    respondentForm.elements.namedItem(field.name).value =
      fieldInputValue(appState.respondent?.[field.name], field);
  });
  respondentIntro.textContent = isEditing
    ? config.questionnaire.respondent.editingDescription
    : config.questionnaire.respondent.description;
  respondentSubmitButton.textContent = isEditing
    ? config.questionnaire.buttons.saveRespondentEdit
    : config.questionnaire.buttons.saveRespondent;
  updateRespondentSubmitState();
  respondentDialog.showModal();
}

function updateFeatureSubmitState() {
  saveFeatureButton.disabled = !formIsComplete(featureForm);
}

function createUuid() {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Tämä selain ei tue UUID-tunnisteiden luontia.");
  }
  return crypto.randomUUID();
}

function startFeatureCreation() {
  createFeatureButton.disabled = true;
  cancelDrawingButton.hidden = false;
  setStatus("Digitointi käynnissä.");
  try {
    sketchViewModel.create(config.questionnaire.geometryType);
  } catch (error) {
    cancelDrawingButton.hidden = true;
    createFeatureButton.disabled = false;
    setStatus(`Digitointia ei voitu aloittaa. ${error.message}`, true);
  }
}

function handleSketchEvent(event) {
  if (event.state === "start") {
    activeDraft = event.graphic;
    return;
  }

  if (event.state === "cancel") {
    if (event.graphic) {
      graphicsLayer.remove(event.graphic);
    }
    activeDraft = null;
    cancelDrawingButton.hidden = true;
    createFeatureButton.disabled = false;
    setStatus("Digitointi peruutettu.");
    return;
  }

  if (event.state !== "complete") {
    return;
  }

  const graphic = event.graphic;
  activeDraft = null;
  cancelDrawingButton.hidden = true;

  let validGeometry;
  try {
    validGeometry = isValidGeometry(graphic.geometry);
  } catch (error) {
    graphicsLayer.remove(graphic);
    createFeatureButton.disabled = false;
    setStatus(`Kohteen geometriaa ei voitu tarkistaa. ${error.message}`, true);
    return;
  }

  if (!validGeometry) {
    graphicsLayer.remove(graphic);
    createFeatureButton.disabled = false;
    setStatus("Kohde ei kelpaa. Tarkista geometria ja piirrä kohde uudelleen.", true);
    return;
  }

  activeDraft = graphic;
  featureForm.reset();
  updateFeatureSubmitState();
  featureDialog.showModal();
}

function isValidGeometry(geometry) {
  if (geometry?.type !== config.questionnaire.geometryType) {
    return false;
  }

  const wkid = geometry.spatialReference?.wkid;
  if (wkid !== 3857 && wkid !== 102100) {
    return false;
  }
  if (geometry.type === "point") {
    return Number.isFinite(geometry.x) && Number.isFinite(geometry.y);
  }
  if (geometry.type === "polyline") {
    const paths = geometry.paths ?? [];
    const vertices = paths.flat();
    return vertices.length >= 2 &&
      vertices.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) &&
      new Set(vertices.map(([x, y]) => `${x},${y}`)).size >= 2;
  }
  if (geometry.type !== "polygon" || !geometry.rings?.length) {
    return false;
  }

  const ring = geometry.rings[0];
  if (ring.length < 4) {
    return false;
  }
  const openRing = ring.slice(0, -1);
  const distinctVertices = new Set(
    openRing.map(([x, y]) => `${x},${y}`)
  );
  const hasFiniteCoordinates = openRing.every(
    ([x, y]) => Number.isFinite(x) && Number.isFinite(y)
  );
  const doubledArea = openRing.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = openRing[(index + 1) % openRing.length];
    return sum + x * nextY - nextX * y;
  }, 0);
  const firstVertex = ring[0];
  const lastVertex = ring[ring.length - 1];
  return (
    firstVertex[0] === lastVertex[0] &&
    firstVertex[1] === lastVertex[1] &&
    distinctVertices.size >= 3 &&
    hasFiniteCoordinates &&
    (wkid === 3857 || wkid === 102100) &&
    simplifyOperator.isSimple(geometry) &&
    Math.abs(doubledArea) > 0
  );
}

function cancelFeatureDraft() {
  featureDialog.close();
  if (activeDraft) {
    graphicsLayer.remove(activeDraft);
    activeDraft = null;
  }
  createFeatureButton.disabled = false;
  setStatus("Kohteen luonti peruutettu.");
}

createFeatureButton.addEventListener("click", () => {
  if (!appState.respondent) {
    openRespondentDialog();
    return;
  }
  startFeatureCreation();
});

respondentStepButton.addEventListener("click", openRespondentDialog);
submitResponseButton.addEventListener("click", submitResponse);

cancelDrawingButton.addEventListener("click", () => sketchViewModel.cancel());

respondentForm.addEventListener("input", updateRespondentSubmitState);
respondentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  updateRespondentSubmitState();
  if (respondentSubmitButton.disabled) {
    return;
  }

  const isEditing = appState.respondent !== null;

  try {
    const responseId = isEditing ? appState.responseId : createUuid();
    const respondent = Object.fromEntries(
      config.questionnaire.respondent.fields.map((field) => [
        field.name,
        getFieldValue(respondentForm.elements.namedItem(field.name), field)
      ])
    );
    appState.respondent = respondent;
    if (!isEditing) {
      appState.responseId = responseId;
      activateFeatureStep();
    } else {
      appState.features.forEach((feature) => {
        Object.assign(feature.attributes, respondent);
        feature.attributes[config.questionnaire.systemFields.responseId] = appState.responseId;
        const graphic = graphicsLayer.graphics.find(
          (candidate) =>
            candidate.attributes?.[config.questionnaire.systemFields.localId] === feature.id
        );
        if (graphic) {
          graphic.attributes = {
            ...graphic.attributes,
            ...respondent,
            [config.questionnaire.systemFields.responseId]: appState.responseId
          };
        }
      });
    }
    respondentDialog.close();
    if (isEditing) {
      setStatus("Vastaajatiedot päivitetty.");
    } else {
      activateFeatureStep();
      setStatus("Vastaajatiedot tallennettu. Aloita digitointi valitsemalla Luo aluekohde. Tarvittaessa avaa Digitointiohjeet.");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    respondentForm.reset();
    respondentDialog.close();
  });
});

respondentDialog.addEventListener("cancel", () => {
  setStatus("Vastaajan tietojen syöttö peruutettiin.");
});

featureForm.addEventListener("input", updateFeatureSubmitState);
featureForm.addEventListener("change", updateFeatureSubmitState);
featureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  updateFeatureSubmitState();
  if (saveFeatureButton.disabled || !activeDraft) {
    return;
  }

  saveFeatureButton.disabled = true;
  try {
    const measurement = calculateMeasurement(activeDraft.geometry);
    const featureValues = Object.fromEntries(
      config.questionnaire.features.fields.map((field) => [
        field.name,
        getFieldValue(featureForm.elements.namedItem(field.name), field)
      ])
    );
    const attributes = {
      [config.questionnaire.systemFields.localId]: createUuid(),
      ...appState.respondent,
      ...featureValues,
      [config.questionnaire.systemFields.responseId]: appState.responseId
    };

    activeDraft.attributes = attributes;
    appState.features.push({
      id: attributes[config.questionnaire.systemFields.localId],
      geometry: activeDraft.geometry,
      measurement,
      attributes
    });
    activateSubmissionStep();
    if (appState.features.length === 1) {
      viewFeaturesButton.hidden = false;
    }
    activeDraft = null;
    featureDialog.close();
    createFeatureButton.disabled = false;
    setStatus(`Kohde tallennettu (${formatFeatureCount(appState.features.length)}).`);
  } catch (error) {
    setStatus(error.message, true);
    updateFeatureSubmitState();
  }
});

featuresTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  if (button.dataset.action === "edit-field") {
    startFieldEditing(button);
  } else if (button.dataset.action === "save-field") {
    saveFieldEditing(button);
  } else if (button.dataset.action === "cancel-field") {
    renderFeaturesTable();
  } else if (button.dataset.action === "edit-geometry") {
    startGeometryEditing(button.dataset.featureId);
  } else if (button.dataset.action === "delete-feature") {
    deleteFeature(button.dataset.featureId);
  }
});

document.querySelector("#cancel-feature-button").addEventListener("click", cancelFeatureDraft);
featureDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  cancelFeatureDraft();
});

viewFeaturesButton.addEventListener("click", () => {
  renderFeaturesTable();
  featuresTableDialog.showModal();
});

digitizingHelpButton.addEventListener("click", () => {
  digitizingHelpDialog.showModal();
});

geometryEditHelpButton.addEventListener("click", () => {
  geometryEditHelpDialog.showModal();
});

document.querySelector("#close-features-table-button").addEventListener("click", () => {
  featuresTableDialog.close();
});

saveGeometryEditButton.addEventListener("click", () => {
  if (!activeGeometryEdit) {
    return;
  }
  try {
    sketchViewModel.complete();
  } catch (error) {
    setStatus(`Geometrian muutos ei voitu tallentaa. ${error.message}`, true);
  }
});

cancelGeometryEditButton.addEventListener("click", () => {
  if (activeGeometryEdit) {
    sketchViewModel.cancel();
    finishGeometryEditing(false);
    setStatus("Geometrian muokkaus peruutettiin.");
  }
});

document.querySelector("#close-digitizing-help-button").addEventListener("click", () => {
  digitizingHelpDialog.close();
});

document.querySelector("#close-geometry-edit-help-button").addEventListener("click", () => {
  geometryEditHelpDialog.close();
});

document.querySelector("#close-questionnaire-button").addEventListener("click", () => {
  thankYouDialog.close();
});

startApp().catch((error) => {
  console.error("Sovelluksen käynnistys epäonnistui:", error);
  setStatus(`Sovelluksen käynnistys epäonnistui. ${error.message}`, true);
});

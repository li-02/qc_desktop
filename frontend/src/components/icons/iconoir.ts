import { defineComponent, h, type Component } from "vue";
import {
  Activity,
  ArrowLeft as IconArrowLeft,
  Check as IconCheck,
  CheckCircle as IconCheckCircle,
  CheckSquare as IconCheckSquare,
  Clock as IconClock,
  Cloud as IconCloud,
  CloudUpload,
  Copy as IconCopy,
  DashboardSpeed,
  Database,
  Drag,
  Droplet,
  EditPencil,
  EmptyPage,
  FileNotFound,
  Filter,
  Flash,
  Folder,
  FolderPlus as IconFolderPlus,
  GraphUp,
  HalfMoon,
  HelpCircle as IconHelpCircle,
  InfoCircle,
  Leaf as IconLeaf,
  Link as IconLink,
  List as IconList,
  MagicWand,
  MapPin as IconMapPin,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  NavArrowUp,
  Page,
  PagePlus,
  Play as IconPlay,
  Plus as IconPlus,
  Refresh,
  RefreshDouble,
  ReportColumns,
  Search as IconSearch,
  Settings as IconSettings,
  Sort,
  Sparks,
  Star as IconStar,
  StatsUpSquare,
  SunLight,
  Table2Columns,
  TextArrowsUpDown,
  Trash,
  ViewColumns3,
  ViewGrid,
  WarningCircle,
  WarningTriangle,
  WhiteFlag,
  Xmark,
  XmarkCircle,
} from "@iconoir/vue";

const icon = (component: Component) =>
  defineComponent({
    name: "QcIconoirIcon",
    inheritAttrs: false,
    props: {
      size: {
        type: [Number, String],
        default: undefined,
      },
    },
    setup(props, { attrs }) {
      return () => {
        const attrsWithSize = { ...attrs };
        if (props.size !== undefined && attrsWithSize.width === undefined && attrsWithSize.height === undefined) {
          attrsWithSize.width = props.size;
          attrsWithSize.height = props.size;
        }

        return h(component, attrsWithSize);
      };
    },
  });

export const AlertCircle = icon(WarningCircle);
export const AlertTriangle = icon(WarningTriangle);
export const ArrowLeft = icon(IconArrowLeft);
export const ArrowUpDown = icon(TextArrowsUpDown);
export const BarChart = icon(StatsUpSquare);
export const BarChart2 = icon(GraphUp);
export const Check = icon(IconCheck);
export const CheckCircle = icon(IconCheckCircle);
export const CheckSquare = icon(IconCheckSquare);
export const ChevronDown = icon(NavArrowDown);
export const ChevronLeft = icon(NavArrowLeft);
export const ChevronRight = icon(NavArrowRight);
export const ChevronUp = icon(NavArrowUp);
export const Clock = icon(IconClock);
export const Cloud = icon(IconCloud);
export const Columns3 = icon(ViewColumns3);
export const Copy = icon(IconCopy);
export const Download = icon(CloudUpload);
export const Droplets = icon(Droplet);
export const Eye = icon(Activity);
export const FilePlus = icon(PagePlus);
export const FileText = icon(Page);
export const FileX = icon(FileNotFound);
export const Flag = icon(WhiteFlag);
export const FolderOpen = icon(Folder);
export const FolderPlus = icon(IconFolderPlus);
export const Gauge = icon(DashboardSpeed);
export const Grid = icon(ViewGrid);
export const GripVertical = icon(Drag);
export const HelpCircle = icon(IconHelpCircle);
export const Info = icon(InfoCircle);
export const Leaf = icon(IconLeaf);
export const LineChart = icon(GraphUp);
export const Link = icon(IconLink);
export const List = icon(IconList);
export const Loader2 = icon(RefreshDouble);
export const MapPin = icon(IconMapPin);
export const Moon = icon(HalfMoon);
export const Pencil = icon(EditPencil);
export const Play = icon(IconPlay);
export const Plus = icon(IconPlus);
export const RefreshCw = icon(Refresh);
export const RotateCcw = icon(RefreshDouble);
export const Search = icon(IconSearch);
export const Settings = icon(IconSettings);
export const Star = icon(IconStar);
export const Sun = icon(SunLight);
export const Trash2 = icon(Trash);
export const TrendingUp = icon(GraphUp);
export const Upload = icon(CloudUpload);
export const Wand2 = icon(MagicWand);
export const X = icon(Xmark);
export const XCircle = icon(XmarkCircle);
export const Zap = icon(Flash);

export const DatabaseIcon = icon(Database);
export const FilterIcon = icon(Filter);
export const ReportColumnsIcon = icon(ReportColumns);
export const SortIcon = icon(Sort);
export const SparksIcon = icon(Sparks);
export const Table2ColumnsIcon = icon(Table2Columns);
export const EmptyPageIcon = icon(EmptyPage);

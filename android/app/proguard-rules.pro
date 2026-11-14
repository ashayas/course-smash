# kotlinx.serialization ships its own rules. The response types are kept by name so stack traces stay readable.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class app.coursesmash.android.**$$serializer { *; }
-keepclassmembers class app.coursesmash.android.** { *** Companion; }
-keepclasseswithmembers class app.coursesmash.android.** { kotlinx.serialization.KSerializer serializer(...); }
